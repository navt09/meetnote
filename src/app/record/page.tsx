"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { MeetingRecorder, checkSupport, MAX_RECORDING_SECONDS, WARN_RECORDING_SECONDS, type SupportCheck } from "@/lib/recorder";
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

export default function RecordPage() {
  const router = useRouter();
  const toast = useToast();
  const support = useSyncExternalStore(noSubscribe, getSupport, () => null);

  const [phase, setPhase] = useState<Phase>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [level, setLevel] = useState(0);
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
  const [recoverable, setRecoverable] = useState<RecordingMeta[]>([]);

  const recorderRef = useRef<MeetingRecorder | null>(null);
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
    let last = 0;

    const render = () => {
      const analyser = recorderRef.current?.analyser;
      if (!analyser) return;
      const data = new Uint8Array(analyser.fftSize);
      analyser.getByteTimeDomainData(data);

      // Loudness, smoothed, drives the glow on the stop button.
      let peak = 0;
      for (let i = 0; i < data.length; i++) peak = Math.max(peak, Math.abs(data[i] - 128) / 128);
      last = last * 0.8 + peak * 0.2;
      setLevel(last);

      ctx.clearRect(0, 0, width, height);
      const grad = ctx.createLinearGradient(0, 0, width, 0);
      grad.addColorStop(0, "rgba(110,231,249,0.25)");
      grad.addColorStop(0.5, "#6ee7f9");
      grad.addColorStop(1, "rgba(139,124,255,0.35)");

      // Mirrored bars, which read better than a raw waveform line.
      const bars = 84;
      const step = width / bars;
      ctx.fillStyle = grad;
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
    setLevel(0);
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
        setLevel(0);
        const out = new Blob(memChunksRef.current, { type: recorder.mimeType });
        assignBlob(out);
        setPhase("stopped");
        if (idbOkRef.current) updateRecording(id, { status: "stopped" }).catch(() => {});
        if (out.size < 2048) setError("The recording came out empty. Nothing was captured.");
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
      setElapsed((s) => {
        const next = s + 1;
        if (next === WARN_RECORDING_SECONDS) setWarning("This is getting long. Recording stops automatically at 3.5 hours.");
        if (next >= MAX_RECORDING_SECONDS) recorderRef.current?.stop();
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
        c = await createMeeting(blob, elapsed, recordedAt ?? new Date());
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
  const glow = 0.35 + level * 0.9;

  return (
    <section className="flex flex-col gap-6 pt-10">
      {support && !support.ok ? (
        <div className="glass pop border-danger/40 p-5 text-sm text-danger">{support.reason}</div>
      ) : null}
      {support?.ok && !support.chromium ? (
        <div className="glass rise p-5 text-sm text-muted">
          This browser can share a screen but not its audio, so you would only capture your own microphone. Chrome and Edge capture both sides.
        </div>
      ) : null}

      {recoverable.length > 0 && phase === "idle" ? (
        <div className="glass glass-lit rise p-5">
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

      <div className="glass glass-lit rise overflow-hidden p-6 sm:p-8">
        <div className="flex flex-col items-center gap-6">
          <div className="flex w-full items-center justify-between">
            <span className={`pill ${phase === "recording" ? "pill-danger" : phase === "saving" ? "pill-live" : ""}`}>
              {phase === "recording" ? <span className="rec-dot !h-1.5 !w-1.5" /> : null}
              {phase === "idle" && "Ready"}
              {phase === "recording" && "Recording"}
              {phase === "stopped" && "Stopped"}
              {phase === "saving" && "Saving"}
            </span>
            <span className="font-mono text-3xl font-semibold tabular-nums tracking-tight">
              {formatTimestamp(elapsed)}
            </span>
          </div>

          <canvas
            ref={canvasRef}
            width={1000}
            height={140}
            className="h-[110px] w-full rounded-2xl bg-black/30 sm:h-[140px]"
            aria-hidden
          />

          {phase === "recording" ? (
            <button
              onClick={() => recorderRef.current?.stop()}
              className="record-btn record-btn-stop"
              style={{ boxShadow: `0 0 0 1px rgba(255,92,122,0.4), 0 0 ${28 + level * 70}px rgba(255,92,122,${glow})` }}
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
          {phase === "recording" && sources ? (
            <p className="text-xs text-muted">
              Capturing {sources.system ? "meeting audio" : ""}{sources.system && sources.mic ? " and " : ""}{sources.mic ? "your mic" : ""}
            </p>
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
          Make sure everyone on the call knows they are being recorded. Audio is backed up in this browser as you go, and only uploaded when you save.
        </p>
      </div>
    </section>
  );
}
