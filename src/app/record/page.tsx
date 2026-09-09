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

type Phase = "idle" | "recording" | "stopped" | "saving";
type SaveStep = "create" | "upload" | "process";

const PHASE_LABEL: Record<Phase, string> = {
  idle: "Ready to record",
  recording: "Recording",
  stopped: "Recording finished",
  saving: "Saving…",
};

let cachedSupport: SupportCheck | null = null;
const getSupport = () => (cachedSupport ??= checkSupport());
const noSubscribe = () => () => {};

export default function RecordPage() {
  const router = useRouter();
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
  const [recoverable, setRecoverable] = useState<RecordingMeta[]>([]);

  const recorderRef = useRef<MeetingRecorder | null>(null);
  const memChunksRef = useRef<Blob[]>([]);
  const idbOkRef = useRef(true);
  const downloadRef = useRef<DownloadLink | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef(0);
  const timerRef = useRef(0);

  // ---- setup / teardown ----------------------------------------------------

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
    const busy = phase === "recording" || phase === "saving";
    if (!busy) return;
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
    const analyser = recorderRef.current?.analyser;
    if (!canvas || !analyser) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const data = new Uint8Array(analyser.fftSize);
    const render = () => {
      const a = recorderRef.current?.analyser;
      if (!a) return;
      a.getByteTimeDomainData(data);
      const { width, height } = canvas;
      ctx.clearRect(0, 0, width, height);
      ctx.lineWidth = 2;
      ctx.strokeStyle = "#6ee7f9";
      ctx.beginPath();
      const step = width / data.length;
      for (let i = 0; i < data.length; i++) {
        const y = (data[i] / 255) * height;
        if (i === 0) ctx.moveTo(0, y);
        else ctx.lineTo(i * step, y);
      }
      ctx.stroke();
      rafRef.current = requestAnimationFrame(render);
    };
    render();
  }, []);

  // ---- recording -------------------------------------------------------------

  function resetForNewRecording() {
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
    resetForNewRecording();
    const id = crypto.randomUUID();
    setRecordingId(id);

    const recorder = new MeetingRecorder({
      onChunk: (chunk, index) => {
        memChunksRef.current.push(chunk);
        if (idbOkRef.current) {
          appendChunk(id, index, chunk).catch(() => {
            idbOkRef.current = false;
            setWarning("Couldn't save a backup copy to this browser's storage. The recording is still in memory; don't close this tab.");
          });
        }
      },
      onStop: () => {
        stopTimers();
        const out = new Blob(memChunksRef.current, { type: recorder.mimeType });
        assignBlob(out);
        setPhase("stopped");
        if (idbOkRef.current) updateRecording(id, { status: "stopped" }).catch(() => {});
        if (out.size < 2048) setError("The recording is empty. Nothing was captured.");
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
      setWarning("Only your microphone is being recorded. Next time, tick “Share audio” in the picker to capture the other participants.");
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
        if (next === WARN_RECORDING_SECONDS) setWarning("This recording is getting long. It will stop automatically at 3.5 hours.");
        if (next >= MAX_RECORDING_SECONDS) recorderRef.current?.stop();
        return next;
      });
    }, 1000);
    drawWave();
  }

  function stop() {
    recorderRef.current?.stop();
  }

  // ---- save: create row -> upload audio -> start processing -> go to the meeting ----

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
      if (recordingId && idbOkRef.current) updateRecording(recordingId, { status: "uploaded", storagePath: c.storagePath }).catch(() => {});

      step = "process";
      setSaveStep("process");
      await startProcessing(c.meetingId);

      if (recordingId && idbOkRef.current) deleteRecording(recordingId).catch(() => {});
      router.push(`/meetings/${c.meetingId}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/401|Sign in required/.test(msg)) {
        setError("Your session expired. Sign in again in another tab, then come back and click Save; the recording is still here.");
      } else {
        setError(`${step === "create" ? "Could not save the meeting" : step === "upload" ? "Upload failed" : "Could not start processing"}: ${msg}`);
      }
      setPhase("stopped");
    }
  }

  // ---- recovery ----------------------------------------------------------------

  async function recover(meta: RecordingMeta) {
    resetForNewRecording();
    try {
      const r = await getRecordingBlob(meta.id);
      if (!r) throw new Error("That recording's data is gone.");
      setRecordingId(meta.id);
      setRecordedAt(new Date(meta.startedAt));
      assignBlob(r.blob);
      setElapsed(Math.round((meta.updatedAt - meta.startedAt) / 1000));
      setRecoverable((list) => list.filter((x) => x.id !== meta.id));
      setPhase("stopped");
      setWarning("Recovered from this browser's backup. Check the length looks right before saving.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not recover the recording.");
    }
  }

  async function discard(meta: RecordingMeta) {
    await deleteRecording(meta.id).catch(() => {});
    setRecoverable((list) => list.filter((x) => x.id !== meta.id));
  }

  // ---- render -------------------------------------------------------------------

  const saveLabel = created ? "Retry save" : "Save and get notes";
  const savingText =
    saveStep === "create" ? "Creating the meeting…" : saveStep === "upload" ? "Uploading audio…" : saveStep === "process" ? "Starting transcription…" : "";

  return (
    <section className="flex flex-col gap-6 pt-10">
      {support && !support.ok ? <div className="glass border-danger/40 p-4 text-sm text-danger">{support.reason}</div> : null}
      {support?.ok && !support.chromium ? (
        <div className="glass p-4 text-sm text-muted">
          This browser can share a screen but not its audio. You would only get your own microphone. Chrome or Edge capture both sides.
        </div>
      ) : null}

      {recoverable.length > 0 && phase === "idle" ? (
        <div className="glass p-4">
          <p className="mb-2 text-sm font-semibold">Unfinished recordings found in this browser</p>
          <ul className="space-y-2 text-sm">
            {recoverable.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-muted">
                  {new Date(r.startedAt).toLocaleString()} · about {formatTimestamp((r.updatedAt - r.startedAt) / 1000)} · {(r.bytes / 1048576).toFixed(1)} MB
                </span>
                <span className="flex gap-2">
                  <button className="btn btn-ghost !px-3 !py-1.5 text-xs" onClick={() => recover(r)}>Recover</button>
                  <button className="btn btn-ghost !px-3 !py-1.5 text-xs text-danger" onClick={() => discard(r)}>Discard</button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="glass p-6">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {phase === "recording" ? <span className="rec-dot" /> : null}
            <h2 className="text-xl font-semibold">{phase === "saving" ? savingText || PHASE_LABEL.saving : PHASE_LABEL[phase]}</h2>
          </div>
          <span className="font-mono text-2xl tabular-nums text-muted">{formatTimestamp(elapsed)}</span>
        </div>

        <canvas ref={canvasRef} width={1000} height={120} className="mb-4 h-[120px] w-full rounded-xl bg-black/30" />

        {phase === "saving" && saveStep === "upload" ? (
          <div className="mb-4">
            <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
              <div className="h-full bg-gradient-to-r from-accent to-accent-2 transition-[width]" style={{ width: `${Math.round(uploadProgress * 100)}%` }} />
            </div>
            <p className="mt-1 text-xs text-muted">{Math.round(uploadProgress * 100)}% · {blob ? (blob.size / 1048576).toFixed(1) : "0"} MB</p>
          </div>
        ) : null}

        {sources && phase === "recording" ? (
          <p className="mb-2 text-xs text-muted">
            Capturing: {sources.system ? "meeting audio" : null}{sources.system && sources.mic ? " + " : null}{sources.mic ? "your mic" : null}
          </p>
        ) : null}
        {warning ? <p className="mb-3 text-sm text-accent">{warning}</p> : null}
        {error ? <p className="mb-3 text-sm text-danger">{error}</p> : null}

        <div className="flex flex-wrap gap-3">
          {phase === "idle" && support?.ok ? <button className="btn btn-primary" onClick={start}>Choose window and record</button> : null}
          {phase === "recording" ? <button className="btn btn-danger" onClick={stop}>Stop</button> : null}
          {phase === "stopped" && blob && blob.size >= 2048 ? (
            <>
              <button className="btn btn-primary" onClick={save}>{saveLabel}</button>
              {download ? <a className="btn btn-ghost" href={download.url} download={download.name}>Download audio</a> : null}
              <button className="btn btn-ghost" onClick={start}>Record again</button>
            </>
          ) : null}
          {phase === "stopped" && (!blob || blob.size < 2048) ? <button className="btn btn-ghost" onClick={start}>Record again</button> : null}
          {phase === "saving" ? <span className="text-sm text-muted">Keep this tab open until the upload finishes.</span> : null}
        </div>

        <p className="mt-4 text-xs text-muted">
          Make sure everyone on the call knows they are being recorded. Audio is backed up in this browser as you go and uploaded to your account when you save.
        </p>
      </div>
    </section>
  );
}
