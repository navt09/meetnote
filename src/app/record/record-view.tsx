"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  MeetingRecorder,
  checkSupport,
  MAX_RECORDING_SECONDS,
  SILENCE_GRACE_SECONDS,
  SILENCE_PROMPT_SECONDS,
  silenceAction,
  WARN_RECORDING_SECONDS,
  type SupportCheck,
} from "@/lib/recorder";
import type { Window } from "@/lib/self-speech";
import { PageHead } from "@/components/ui";
import {
  appendChunk,
  createRecording,
  deleteRecording,
  getRecordingBlob,
  hasIndexedDb,
  listRecordings,
  updateRecording,
  type RecordingMeta,
} from "@/lib/recording-store";
import { createMeeting, startProcessing, uploadMeetingAudio, type CreatedMeeting } from "@/lib/upload";
import { formatTimestamp } from "@/lib/transcript";
import { makeDownloadLink, revokeDownloadLink, type DownloadLink } from "@/lib/download";
import { useToast } from "@/components/toast";

type Phase = "idle" | "recording" | "stopped" | "saving";
type SaveStep = "create" | "upload" | "process";

let cachedSupport: SupportCheck | null = null;
const getSupport = () => (cachedSupport ??= checkSupport());
const noSubscribe = () => () => {};

/**
 * `meetingsLeft` is only passed for a free account, and is counted on the
 * server: a client component must not read the database to find out.
 */
export default function RecordView({ meetingsLeft }: { meetingsLeft?: number }) {
  const router = useRouter();
  const toast = useToast();
  const support = useSyncExternalStore(noSubscribe, getSupport, () => null);

  const [phase, setPhase] = useState<Phase>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [saveStep, setSaveStep] = useState<SaveStep | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);

  const [recordingId, setRecordingId] = useState<string | null>(null);
  const [recordedAt, setRecordedAt] = useState<Date | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [download, setDownload] = useState<DownloadLink | null>(null);
  const [created, setCreated] = useState<CreatedMeeting | null>(null);
  const [sources, setSources] = useState<{ system: boolean; mic: boolean } | null>(null);
  // Seconds of continuous silence right now. Nonzero for long means nothing is being captured.
  const [silentFor, setSilentFor] = useState(0);
  // Seconds of silence left out of the file, and whether any is being left out
  // right now.
  const [trimmed, setTrimmed] = useState(0);
  // Set when someone answers the "still going?" question. Cleared the moment
  // anything is heard again, so a second long silence asks again rather than
  // recording in silence for ever on one old answer.
  const [stillGoing, setStillGoing] = useState(false);
  // The one-second timer closes over the render that created it, so the answer
  // reaches it through a ref rather than through state.
  const stillGoingRef = useRef(false);
  const [recoverable, setRecoverable] = useState<RecordingMeta[]>([]);

  const recorderRef = useRef<MeetingRecorder | null>(null);
  // When the user was speaking. Read off the recorder at stop, sent with the meeting.
  const selfSpeechRef = useRef<Window[]>([]);
  const memChunksRef = useRef<Blob[]>([]);
  const idbOkRef = useRef(true);
  const downloadRef = useRef<DownloadLink | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef(0);
  const timerRef = useRef(0);

  // ---- setup ---------------------------------------------------------------

  useEffect(() => {
    if (hasIndexedDb()) {
      listRecordings()
        .then((all) => setRecoverable(all.filter((r) => r.status !== "uploaded" && r.chunkCount > 0)))
        .catch(() => {});
    } else {
      idbOkRef.current = false;
    }
  }, []);

  useEffect(() => {
    if (phase !== "recording" && phase !== "saving") return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [phase]);

  function assignBlob(b: Blob | null) {
    revokeDownloadLink(downloadRef.current);
    const link = b ? makeDownloadLink(b) : null;
    downloadRef.current = link;
    setBlob(b);
    setDownload(link);
  }

  const stopTimers = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    window.clearInterval(timerRef.current);
  }, []);

  useEffect(
    () => () => {
      stopTimers();
      recorderRef.current?.dispose();
      revokeDownloadLink(downloadRef.current);
    },
    [stopTimers],
  );

  // ---- waveform ------------------------------------------------------------

  const drawWave = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const { width, height } = canvas;
    const mid = height / 2;

    const render = () => {
      const analyser = recorderRef.current?.analyser;
      if (!analyser) return;
      const data = new Uint8Array(analyser.fftSize);
      analyser.getByteTimeDomainData(data);

      ctx.clearRect(0, 0, width, height);

      // Mirrored bars, which read better than a raw waveform line.
      const bars = 84;
      const step = width / bars;
      ctx.fillStyle = "#629bff";
      for (let b = 0; b < bars; b++) {
        const slice = data.slice(Math.floor((b / bars) * data.length), Math.floor(((b + 1) / bars) * data.length));
        let m = 0;
        for (const v of slice) m = Math.max(m, Math.abs(v - 128) / 128);
        const h = Math.max(2, m * (height * 0.86));
        const x = b * step + step * 0.2;
        const w = Math.max(1.5, step * 0.55);
        ctx.beginPath();
        ctx.roundRect(x, mid - h / 2, w, h, w / 2);
        ctx.fill();
      }
      rafRef.current = requestAnimationFrame(render);
    };
    render();
  }, []);

  // ---- recording -----------------------------------------------------------

  function reset() {
    setError(null);
    setWarning(null);
    setSaveStep(null);
    assignBlob(null);
    setCreated(null);
    setElapsed(0);
    setUploadProgress(0);
    memChunksRef.current = [];
  }

  async function start() {
    reset();
    const id = crypto.randomUUID();
    setRecordingId(id);

    const recorder = new MeetingRecorder({
      onChunk: (chunk, index) => {
        memChunksRef.current.push(chunk);
        if (idbOkRef.current) {
          appendChunk(id, index, chunk).catch(() => {
            idbOkRef.current = false;
            setWarning("Couldn't save a backup to this browser. The recording is still in memory, so don't close this tab.");
          });
        }
      },
      onStop: () => {
        stopTimers();
        selfSpeechRef.current = recorder.selfSpeech();
        const out = new Blob(memChunksRef.current, { type: recorder.mimeType });
        assignBlob(out);
        setPhase("stopped");
        setSilentFor(0);
        if (idbOkRef.current) updateRecording(id, { status: "stopped" }).catch(() => {});
        if (out.size < 2048) {
          setError("The recording came out empty. Nothing was captured.");
        } else {
          // Transcription is billed by the length of the audio, not by what is
          // in it, so an hour of silence costs the same as an hour of meeting
          // and can only produce an empty set of notes. Say so before it is
          // paid for, rather than after.
          const audible = recorder.audibleSeconds();
          const measured = recorder.measuredSeconds();
          if (audible < 1) {
            setError("There is no audio in this recording at all. Saving it would cost money and produce nothing, so it is worth recording again with the audio sorted.");
          } else if (measured > 30 && audible < measured * 0.05) {
            setWarning(`Only about ${Math.round(audible)}s of this ${Math.round(measured)}s recording had any sound in it. You can still save it, but it will mostly be silence.`);
          }
        }
      },
      onSourceEnded: () => setWarning("Screen sharing was ended from the browser, so the recording stopped."),
      onError: (msg) => setError(msg),
    });
    recorderRef.current = recorder;

    try {
      await recorder.start();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start recording.");
      recorderRef.current = null;
      return;
    }

    setRecordedAt(new Date());
    setSources({ system: recorder.hasSystemAudio, mic: recorder.hasMic });
    if (!recorder.hasSystemAudio) {
      setWarning("Only your microphone is being captured. Tick “Share audio” in the picker to get the other people too.");
    }
    if (idbOkRef.current) {
      createRecording({ id, mimeType: recorder.mimeType }).catch(() => {
        idbOkRef.current = false;
      });
    }

    setPhase("recording");
    timerRef.current = window.setInterval(() => {
      const rec = recorderRef.current;
      const silent = rec?.silentForSeconds() ?? 0;
      setSilentFor(silent);
      setTrimmed(rec?.trimmedSeconds() ?? 0);

      // Anything audible clears the question, so the next long silence asks
      // again from scratch.
      if (silent < 2) {
        stillGoingRef.current = false;
        setStillGoing(false);
      }
      if (silenceAction(silent, stillGoingRef.current) === "stop") {
        setWarning(
          "Recording stopped: nothing was heard for five minutes and the question went unanswered. Everything up to that point is here to save.",
        );
        rec?.stop();
      }

      setElapsed((s) => {
        const next = s + 1;
        if (next === WARN_RECORDING_SECONDS) setWarning("This is getting long. Recording stops automatically at 3.5 hours.");
        if (next >= MAX_RECORDING_SECONDS) rec?.stop();
        return next;
      });
    }, 1000);
    drawWave();
  }

  // ---- save ----------------------------------------------------------------

  async function save() {
    if (!blob) return;
    setError(null);
    setPhase("saving");
    let step: SaveStep = created ? "upload" : "create";
    try {
      let c = created;
      if (!c) {
        setSaveStep("create");
        c = await createMeeting(blob, elapsed, recordedAt ?? new Date(), selfSpeechRef.current, sources);
        setCreated(c);
      }
      step = "upload";
      setSaveStep("upload");
      await uploadMeetingAudio(c, blob, setUploadProgress);
      if (recordingId && idbOkRef.current) updateRecording(recordingId, { status: "uploaded" }).catch(() => {});

      step = "process";
      setSaveStep("process");
      await startProcessing(c.meetingId);

      if (recordingId && idbOkRef.current) deleteRecording(recordingId).catch(() => {});
      toast("Saved. Writing your notes now.", "ok");
      router.push(`/meetings/${c.meetingId}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(
        /401|Sign in required/.test(msg)
          ? "Your session expired. Sign in again in another tab, then click Save. The recording is still here."
          : `${step === "create" ? "Couldn't save the meeting" : step === "upload" ? "Upload failed" : "Couldn't start processing"}: ${msg}`,
      );
      setPhase("stopped");
    }
  }

  // ---- recovery ------------------------------------------------------------

  async function recover(meta: RecordingMeta) {
    reset();
    try {
      const r = await getRecordingBlob(meta.id);
      if (!r) throw new Error("That recording's data is gone.");
      setRecordingId(meta.id);
      setRecordedAt(new Date(meta.startedAt));
      assignBlob(r.blob);
      setElapsed(Math.round((meta.updatedAt - meta.startedAt) / 1000));
      setRecoverable((l) => l.filter((x) => x.id !== meta.id));
      setPhase("stopped");
      toast("Recording recovered", "ok");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not recover the recording.");
    }
  }

  async function discard(meta: RecordingMeta) {
    await deleteRecording(meta.id).catch(() => {});
    setRecoverable((l) => l.filter((x) => x.id !== meta.id));
    toast("Discarded", "info");
  }

  // ---- render --------------------------------------------------------------

  const savingText = saveStep === "create" ? "Creating the meeting" : saveStep === "upload" ? "Uploading audio" : "Starting transcription";

  return (
    <section className="flex flex-col gap-6 pt-10">
      <PageHead title="Record" meta="Nothing joins the call. Your browser does the recording, on this machine." />

      {meetingsLeft !== undefined ? (
        <p className="rise text-sm text-muted">
          <span className="font-mono">{meetingsLeft}</span>{" "}
          {meetingsLeft === 1 ? "free meeting" : "free meetings"} left this month.{" "}
          <Link href="/#pricing" className="font-medium text-accent transition-opacity hover:opacity-70">
            Pro records as many as you like
          </Link>
          .
        </p>
      ) : null}

      {support && !support.ok ? (
        <div className="glass pop border-danger/40 p-5 text-sm text-danger">{support.reason}</div>
      ) : null}
      {support?.ok && !support.chromium ? (
        <div className="glass rise p-5 text-sm text-muted">
          This browser can share a screen but not its audio, so you would only capture your own microphone. Chrome and Edge capture both sides.
        </div>
      ) : null}

      {recoverable.length > 0 && phase === "idle" ? (
        <div className="glass rise p-5">
          <p className="mb-3 text-sm font-semibold">Unfinished recordings in this browser</p>
          <ul className="space-y-2 text-sm">
            {recoverable.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-muted">
                  {new Date(r.startedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
                  {" · "}~{formatTimestamp((r.updatedAt - r.startedAt) / 1000)} · {(r.bytes / 1048576).toFixed(1)} MB
                </span>
                <span className="flex gap-2">
                  <button className="btn btn-ghost !px-3 !py-1.5 text-xs" onClick={() => recover(r)}>Recover</button>
                  <button className="btn btn-ghost !px-3 !py-1.5 text-xs text-muted hover:!text-danger" onClick={() => discard(r)}>Discard</button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="glass rise overflow-hidden p-6 sm:p-8">
        <div className="flex flex-col items-center gap-6">
          <div className="flex w-full items-center justify-between">
            <span className={`pill ${phase === "recording" ? "pill-danger" : phase === "saving" ? "pill-live" : ""}`}>
              {phase === "recording" ? <span className="rec-dot !h-1.5 !w-1.5" /> : null}
              {phase === "idle" && "Ready"}
              {phase === "recording" && "Recording"}
              {phase === "stopped" && "Stopped"}
              {phase === "saving" && "Saving"}
            </span>
            <span className="figure text-4xl">{formatTimestamp(elapsed)}</span>
          </div>

          <canvas
            ref={canvasRef}
            width={1000}
            height={140}
            className="h-[100px] w-full rounded-lg bg-bg-elev sm:h-[120px]"
            aria-hidden
          />

          {phase === "recording" ? (
            <button
              onClick={() => recorderRef.current?.stop()}
              className="record-btn record-btn-stop"
              aria-label="Stop recording"
            >
              <span className="block h-6 w-6 rounded-[6px] bg-current" />
            </button>
          ) : phase === "idle" || phase === "stopped" ? (
            <button onClick={start} disabled={!support?.ok} className="record-btn" aria-label="Choose a window and start recording">
              <span className="block h-7 w-7 rounded-full bg-current" />
            </button>
          ) : (
            <div className="w-full max-w-sm">
              <p className="mb-2 text-center text-sm font-medium">
                <span className="dots">{savingText}</span>
              </p>
              <div className={`bar-track ${saveStep === "upload" ? "" : "bar-indeterminate"}`}>
                {saveStep === "upload" ? <div className="bar-fill" style={{ width: `${Math.round(uploadProgress * 100)}%` }} /> : null}
              </div>
              {saveStep === "upload" ? (
                <p className="mt-2 text-center text-xs text-muted">
                  {Math.round(uploadProgress * 100)}% of {blob ? (blob.size / 1048576).toFixed(1) : "0"} MB
                </p>
              ) : null}
            </div>
          )}

          {phase === "idle" ? <p className="text-sm text-muted">Click to pick a window and start</p> : null}
          {/* Missing meeting audio is not a footnote: it means the other side of
              the call is not being recorded at all, and it is worth losing ten
              seconds to fix rather than finding out after the meeting. */}
          {phase === "recording" && sources && !sources.system ? (
            <div className="max-w-sm rounded-lg border border-warn/50 bg-warn/10 px-4 py-3 text-center">
              <p className="text-sm font-medium text-warn">Only your microphone is being recorded</p>
              <p className="mt-1 text-xs leading-relaxed text-muted">
                Nobody else on the call is being captured. Stop, start again, and tick “Share audio” in the picker.
              </p>
            </div>
          ) : null}
          {/* While a meeting runs there is nothing to look at but a timer, and
              no way to tell a working recording from a broken one. This says
              what is actually arriving, and keeps counting since the last
              sound, so silence is visible long before the alarm fires. */}
          {phase === "recording" ? (
            <dl className="strip w-full max-w-md grid-cols-2 text-center sm:grid-cols-4">
              <div>
                <dt className="text-xs text-faint">Meeting</dt>
                <dd className={`mt-1.5 text-sm font-medium ${sources?.system ? "" : "text-warn"}`}>
                  {sources?.system ? "Captured" : "Not shared"}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-faint">Your mic</dt>
                <dd className={`mt-1.5 text-sm font-medium ${sources?.mic ? "" : "text-warn"}`}>
                  {sources?.mic ? "Captured" : "Off"}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-faint">Not recorded</dt>
                <dd className="figure mt-1.5 text-sm">{trimmed >= 1 ? formatTimestamp(trimmed) : "0:00"}</dd>
              </div>
              <div>
                <dt className="text-xs text-faint">Last heard</dt>
                <dd className={`figure mt-1.5 text-sm ${silentFor >= 60 ? "text-warn" : ""}`}>
                  {silentFor < 2 ? "just now" : `${Math.round(silentFor)}s ago`}
                </dd>
              </div>
            </dl>
          ) : null}

          {/* Silence is the one thing worth interrupting a recording over,
              since transcription is billed by length rather than content. The
              question is asked at three minutes and answered by pressing a
              button; two minutes later, unanswered, recording stops. Nothing
              is thrown away when it does, and the audio recorded so far is
              still there to save. Stopping without asking would eventually
              cut a real meeting off during a long demo or a document being
              read aloud, which is a far worse thing to get wrong than a few
              cents of transcription. */}
          {phase === "recording" && silenceAction(silentFor, stillGoing) === "ask" ? (
            <div className="max-w-sm rounded-lg border border-danger/50 bg-danger/10 px-4 py-3 text-center">
              <p className="text-sm font-medium text-danger">Is this meeting still going?</p>
              <p className="mt-1 text-xs leading-relaxed text-muted">
                Nothing has been heard from either side for {Math.round(silentFor / 60)} minutes. Recording stops in{" "}
                <span className="figure">
                  {formatTimestamp(Math.max(0, SILENCE_PROMPT_SECONDS + SILENCE_GRACE_SECONDS - silentFor))}
                </span>{" "}
                unless you say otherwise.
              </p>
              <button
                className="btn btn-primary mt-3 !py-1 text-xs"
                onClick={() => {
                  stillGoingRef.current = true;
                  setStillGoing(true);
                }}
              >
                Yes, keep recording
              </button>
            </div>
          ) : null}

          {phase === "stopped" && blob && blob.size >= 2048 ? (
            <div className="pop flex flex-wrap justify-center gap-3">
              <button className="btn btn-primary" onClick={save}>{created ? "Retry save" : "Save and get notes"}</button>
              {download ? <a className="btn btn-ghost" href={download.url} download={download.name}>Download</a> : null}
              <button className="btn btn-ghost" onClick={start}>Record again</button>
            </div>
          ) : null}
        </div>

        {warning ? <p className="mt-6 border-t border-panel-border pt-4 text-sm text-warn">{warning}</p> : null}
        {error ? <p className="mt-4 text-sm text-danger">{error}</p> : null}

        <p className="mt-6 border-t border-panel-border pt-4 text-xs leading-relaxed text-muted">
          Make sure everyone on the call knows they are being recorded. Audio is backed up in this browser as you go, and
          only uploaded when you save. If nothing is heard from either side for three minutes, this page says so rather
          than letting you record an hour of nothing.
        </p>
      </div>

      {/* The page used to be a button and a timer, which told a first-time
          visitor nothing about what they were agreeing to. */}
      {phase === "idle" ? (
        <ol className="strip rise sm:grid-cols-3">
          {[
            {
              n: "01",
              title: "Pick the window",
              body: "Tick \u201cShare audio\u201d in the picker. Without it only your own voice is recorded, and everyone in the room counts as you.",
            },
            {
              n: "02",
              title: "Leave this tab open",
              body: "Audio is written to this browser every few seconds. A crash, a closed lid or a flat battery costs you nothing.",
            },
            {
              n: "03",
              title: "Stop, then save",
              body: "Notes, tasks and drafted follow-ups are ready a few minutes later. Nothing is sent anywhere until you approve it.",
            },
          ].map((s) => (
            <li key={s.n} className="!p-5">
              <p className="figure text-sm text-faint">{s.n}</p>
              <p className="mt-2 font-medium leading-snug">{s.title}</p>
              <p className="mt-1 text-sm leading-relaxed text-muted">{s.body}</p>
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
}
