"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { MeetingNotes, TranscriptSegment } from "@/lib/schema";
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
import { postJson, uploadRecording } from "@/lib/upload";
import { formatTimestamp } from "@/lib/transcript";
import { formatUsd } from "@/lib/cost";
import { notesToMarkdown } from "@/lib/markdown";
import { makeDownloadLink, revokeDownloadLink, type DownloadLink } from "@/lib/download";

type Phase = "idle" | "recording" | "stopped" | "uploading" | "transcribing" | "extracting" | "done";
type Step = "upload" | "transcribe" | "extract";

type Costs = { durationSeconds: number; transcriptionUsd: number; llmUsd: number; inputTokens: number; outputTokens: number };

const PHASE_LABEL: Record<Phase, string> = {
  idle: "Ready to record",
  recording: "Recording",
  stopped: "Recording finished",
  uploading: "Uploading recording…",
  transcribing: "Transcribing…",
  extracting: "Pulling out notes and tasks…",
  done: "Done",
};

// Browser capability is a fixed fact of the environment, read once on the
// client. On the server it is unknown (null), which avoids hydration mismatches.
let cachedSupport: SupportCheck | null = null;
const getSupport = () => (cachedSupport ??= checkSupport());
const noSubscribe = () => () => {};

export default function RecordPage() {
  const support = useSyncExternalStore(noSubscribe, getSupport, () => null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [failedStep, setFailedStep] = useState<Step | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);

  const [recordingId, setRecordingId] = useState<string | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [storagePath, setStoragePath] = useState<string | null>(null);
  const [segments, setSegments] = useState<TranscriptSegment[] | null>(null);
  const [notes, setNotes] = useState<MeetingNotes | null>(null);
  const [costs, setCosts] = useState<Costs | null>(null);
  const [sources, setSources] = useState<{ system: boolean; mic: boolean } | null>(null);
  const [recoverable, setRecoverable] = useState<RecordingMeta[]>([]);
  const [copied, setCopied] = useState(false);
  const [download, setDownload] = useState<DownloadLink | null>(null);
  const downloadRef = useRef<DownloadLink | null>(null);

  const recorderRef = useRef<MeetingRecorder | null>(null);
  const memChunksRef = useRef<Blob[]>([]);
  const idbOkRef = useRef(true);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef(0);
  const timerRef = useRef(0);

  // ---- setup / teardown -------------------------------------------------

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
    const busy = phase === "recording" || phase === "uploading" || phase === "transcribing" || phase === "extracting";
    if (!busy) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [phase]);

  // One object URL per recording, revoked when replaced, so memory isn't leaked.
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

  // ---- waveform ----------------------------------------------------------

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

  // ---- recording -----------------------------------------------------------

  function resetForNewRecording() {
    setError(null);
    setWarning(null);
    setFailedStep(null);
    assignBlob(null);
    setStoragePath(null);
    setSegments(null);
    setNotes(null);
    setCosts(null);
    setElapsed(0);
    setUploadProgress(0);
    setCopied(false);
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

  // ---- pipeline: upload -> transcribe -> extract ---------------------------

  async function runPipeline(from: Step) {
    if (!blob) return;
    setError(null);
    setFailedStep(null);
    let step: Step = from;
    try {
      let path = storagePath;
      if (step === "upload") {
        setPhase("uploading");
        setUploadProgress(0);
        path = await uploadRecording(blob, setUploadProgress);
        setStoragePath(path);
        if (recordingId && idbOkRef.current) updateRecording(recordingId, { status: "uploaded", storagePath: path }).catch(() => {});
        step = "transcribe";
      }

      let segs = segments;
      if (step === "transcribe") {
        if (!path) throw new Error("No uploaded recording to transcribe.");
        setPhase("transcribing");
        const r = await postJson<{ segments: TranscriptSegment[]; durationSeconds: number; costUsd: number }>("/api/transcribe", { path });
        segs = r.segments;
        setSegments(segs);
        setCosts({ durationSeconds: r.durationSeconds, transcriptionUsd: r.costUsd, llmUsd: 0, inputTokens: 0, outputTokens: 0 });
        if (segs.length === 0) throw new Error("No speech was detected in the recording.");
        step = "extract";
      }

      if (!segs || segs.length === 0) throw new Error("No transcript to extract from.");
      setPhase("extracting");
      const e = await postJson<{ notes: MeetingNotes; usage: { input_tokens: number; output_tokens: number }; costUsd: number }>(
        "/api/extract",
        { segments: segs },
      );
      setNotes(e.notes);
      setCosts((c) => ({
        durationSeconds: c?.durationSeconds ?? 0,
        transcriptionUsd: c?.transcriptionUsd ?? 0,
        llmUsd: e.costUsd,
        inputTokens: e.usage.input_tokens,
        outputTokens: e.usage.output_tokens,
      }));
      setPhase("done");
      // The audio is safely in storage now; free the local backup.
      if (recordingId && idbOkRef.current) deleteRecording(recordingId).catch(() => {});
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setFailedStep(step);
      setPhase("stopped");
    }
  }

  // ---- recovery ------------------------------------------------------------

  async function recover(meta: RecordingMeta) {
    resetForNewRecording();
    try {
      const r = await getRecordingBlob(meta.id);
      if (!r) throw new Error("That recording's data is gone.");
      setRecordingId(meta.id);
      assignBlob(r.blob);
      setElapsed(Math.round((meta.updatedAt - meta.startedAt) / 1000));
      if (r.meta.storagePath) setStoragePath(r.meta.storagePath);
      setRecoverable((list) => list.filter((x) => x.id !== meta.id));
      setPhase("stopped");
      setWarning("Recovered from this browser's backup. Check the length looks right before transcribing.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not recover the recording.");
    }
  }

  async function discard(meta: RecordingMeta) {
    await deleteRecording(meta.id).catch(() => {});
    setRecoverable((list) => list.filter((x) => x.id !== meta.id));
  }

  async function copyMarkdown() {
    if (!notes) return;
    try {
      await navigator.clipboard.writeText(notesToMarkdown(notes, new Date()));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Couldn't access the clipboard.");
    }
  }

  // ---- render --------------------------------------------------------------

  const busy = phase === "uploading" || phase === "transcribing" || phase === "extracting";
  const retryLabel = failedStep === "upload" ? "Retry upload" : failedStep === "transcribe" ? "Retry transcription" : failedStep === "extract" ? "Retry extraction" : "Transcribe and extract";

  return (
    <section className="flex flex-col gap-6 pt-10">
      {support && !support.ok ? (
        <div className="glass border-danger/40 p-4 text-sm text-danger">{support.reason}</div>
      ) : null}
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
                  <button className="btn btn-ghost !py-1.5 !px-3 text-xs" onClick={() => recover(r)}>Recover</button>
                  <button className="btn btn-ghost !py-1.5 !px-3 text-xs text-danger" onClick={() => discard(r)}>Discard</button>
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
            <h2 className="text-xl font-semibold">{PHASE_LABEL[phase]}</h2>
          </div>
          <span className="font-mono text-2xl tabular-nums text-muted">{formatTimestamp(elapsed)}</span>
        </div>

        <canvas ref={canvasRef} width={1000} height={120} className="mb-4 h-[120px] w-full rounded-xl bg-black/30" />

        {phase === "uploading" ? (
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
          {(phase === "idle" || phase === "done") && support?.ok ? (
            <button className="btn btn-primary" onClick={start}>Choose window and record</button>
          ) : null}
          {phase === "recording" ? <button className="btn btn-danger" onClick={stop}>Stop</button> : null}
          {phase === "stopped" && blob && blob.size >= 2048 ? (
            <>
              <button className="btn btn-primary" onClick={() => runPipeline(failedStep ?? (storagePath ? "transcribe" : "upload"))}>{retryLabel}</button>
              {download ? <a className="btn btn-ghost" href={download.url} download={download.name}>Download audio</a> : null}
              <button className="btn btn-ghost" onClick={start}>Record again</button>
            </>
          ) : null}
          {phase === "stopped" && (!blob || blob.size < 2048) ? <button className="btn btn-ghost" onClick={start}>Record again</button> : null}
          {busy ? <span className="text-sm text-muted">This can take a minute for long meetings. Keep this tab open.</span> : null}
        </div>

        <p className="mt-4 text-xs text-muted">
          Make sure everyone on the call knows they are being recorded. Audio is saved in this browser as you go and only uploaded when you click transcribe.
        </p>
      </div>

      {notes ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CostLine costs={costs} />
            <div className="flex gap-2">
              <button className="btn btn-ghost !py-1.5 !px-3 text-xs" onClick={copyMarkdown}>{copied ? "Copied" : "Copy as Markdown"}</button>
              {download ? (
                <a className="btn btn-ghost !py-1.5 !px-3 text-xs" href={download.url} download={download.name}>Download audio</a>
              ) : null}
            </div>
          </div>
          <NotesView notes={notes} />
        </>
      ) : null}
      {segments ? <TranscriptView segments={segments} /> : null}
    </section>
  );
}

function CostLine({ costs }: { costs: Costs | null }) {
  if (!costs) return null;
  const total = costs.transcriptionUsd + costs.llmUsd;
  return (
    <p className="text-xs text-muted">
      {formatTimestamp(costs.durationSeconds)} of audio · this meeting cost {formatUsd(total)} (transcription {formatUsd(costs.transcriptionUsd)}, notes {formatUsd(costs.llmUsd)})
    </p>
  );
}

function NotesView({ notes }: { notes: MeetingNotes }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="glass p-5 md:col-span-2">
        <span className="pill">Summary</span>
        <h3 className="mt-3 text-2xl font-semibold">{notes.title}</h3>
        <p className="mt-2 text-muted">{notes.summary}</p>
        {notes.key_points.length ? (
          <ul className="mt-4 list-disc space-y-1 pl-5 text-sm">
            {notes.key_points.map((k, i) => <li key={i}>{k}</li>)}
          </ul>
        ) : null}
      </div>

      <div className="glass p-5">
        <span className="pill">Action items · {notes.action_items.length}</span>
        <ul className="mt-3 space-y-3">
          {notes.action_items.map((a, i) => (
            <li key={i} className="rounded-xl border border-panel-border bg-black/20 p-3">
              <div className="flex items-start justify-between gap-2">
                <p className="font-medium">{a.title}</p>
                <span className={`pill ${a.priority === "high" ? "text-danger" : ""}`}>{a.priority}</span>
              </div>
              <p className="mt-1 text-sm text-muted">{a.details}</p>
              <p className="mt-2 text-xs text-muted">
                {a.kind} · {a.owner ?? "unassigned"}{a.due ? ` · due ${a.due}` : ""}
              </p>
            </li>
          ))}
          {notes.action_items.length === 0 ? <li className="text-sm text-muted">None found.</li> : null}
        </ul>
      </div>

      <div className="flex flex-col gap-4">
        <div className="glass p-5">
          <span className="pill">Decisions</span>
          <ul className="mt-3 space-y-2 text-sm">
            {notes.decisions.map((d, i) => (
              <li key={i}><span className="font-medium">{d.decision}</span> <span className="text-muted">— {d.context}</span></li>
            ))}
            {notes.decisions.length === 0 ? <li className="text-muted">None recorded.</li> : null}
          </ul>
        </div>
        <div className="glass p-5">
          <span className="pill">People to contact</span>
          <ul className="mt-3 space-y-2 text-sm">
            {notes.people_to_contact.map((p, i) => (
              <li key={i}><span className="font-medium">{p.name}</span>{p.role ? <span className="text-muted"> · {p.role}</span> : null}<div className="text-muted">{p.why}</div></li>
            ))}
            {notes.people_to_contact.length === 0 ? <li className="text-muted">Nobody flagged.</li> : null}
          </ul>
        </div>
        <div className="glass p-5">
          <span className="pill">Open questions</span>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm">
            {notes.open_questions.map((q, i) => <li key={i}>{q}</li>)}
            {notes.open_questions.length === 0 ? <li className="list-none text-muted">None.</li> : null}
          </ul>
        </div>
      </div>
    </div>
  );
}

function TranscriptView({ segments }: { segments: TranscriptSegment[] }) {
  return (
    <details className="glass p-5">
      <summary className="cursor-pointer font-semibold">Transcript · {segments.length} segments</summary>
      <div className="mt-4 space-y-2 font-mono text-sm">
        {segments.map((s, i) => (
          <p key={i}>
            <span className="text-muted">[{formatTimestamp(s.start)}]</span> <span className="text-accent">{s.speaker}:</span> {s.text}
          </p>
        ))}
      </div>
    </details>
  );
}
