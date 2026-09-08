"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { MeetingNotes, TranscriptSegment } from "@/lib/schema";

type Phase = "idle" | "recording" | "recorded" | "transcribing" | "extracting" | "done";

export default function RecordPage() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [hasSystemAudio, setHasSystemAudio] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [segments, setSegments] = useState<TranscriptSegment[] | null>(null);
  const [notes, setNotes] = useState<MeetingNotes | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamsRef = useRef<MediaStream[]>([]);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number>(0);
  const timerRef = useRef<number>(0);

  const cleanup = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    window.clearInterval(timerRef.current);
    streamsRef.current.forEach((s) => s.getTracks().forEach((t) => t.stop()));
    streamsRef.current = [];
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    analyserRef.current = null;
  }, []);

  useEffect(() => cleanup, [cleanup]);

  const drawWave = useCallback(() => {
    const canvas = canvasRef.current;
    const analyser = analyserRef.current;
    if (!canvas || !analyser) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const data = new Uint8Array(analyser.fftSize);
    const render = () => {
      analyser.getByteTimeDomainData(data);
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

  async function start() {
    setError(null);
    setNotes(null);
    setSegments(null);
    setBlob(null);
    setElapsed(0);
    chunksRef.current = [];

    if (!navigator.mediaDevices?.getDisplayMedia) {
      setError("This browser can't capture screen audio. Use Chrome or Edge on desktop.");
      return;
    }

    let display: MediaStream;
    try {
      display = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: { echoCancellation: false, noiseSuppression: false },
      });
    } catch {
      setError("Screen selection was cancelled.");
      return;
    }
    streamsRef.current.push(display);

    let mic: MediaStream | null = null;
    try {
      mic = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamsRef.current.push(mic);
    } catch {
      // Mic is optional; system audio alone still works.
    }

    const sysTracks = display.getAudioTracks();
    setHasSystemAudio(sysTracks.length > 0);
    if (sysTracks.length === 0 && !mic) {
      cleanup();
      setError("No audio at all. Tick “Share audio” when choosing the window, or allow the microphone.");
      return;
    }

    const audioCtx = new AudioContext();
    audioCtxRef.current = audioCtx;
    const dest = audioCtx.createMediaStreamDestination();
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 1024;
    analyserRef.current = analyser;

    if (sysTracks.length > 0) {
      const src = audioCtx.createMediaStreamSource(new MediaStream(sysTracks));
      src.connect(dest);
      src.connect(analyser);
    }
    if (mic) {
      const src = audioCtx.createMediaStreamSource(mic);
      src.connect(dest);
      src.connect(analyser);
    }

    const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : "audio/webm";
    const recorder = new MediaRecorder(dest.stream, { mimeType });
    recorderRef.current = recorder;
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = () => {
      const out = new Blob(chunksRef.current, { type: mimeType });
      setBlob(out);
      setPhase("recorded");
      cleanup();
    };
    recorder.start(1000);

    // If the user clicks the browser's own "Stop sharing" button, end the recording.
    display.getVideoTracks()[0]?.addEventListener("ended", () => stop());

    timerRef.current = window.setInterval(() => setElapsed((s) => s + 1), 1000);
    setPhase("recording");
    drawWave();
  }

  function stop() {
    const r = recorderRef.current;
    if (r && r.state !== "inactive") r.stop();
    else cleanup();
  }

  async function process() {
    if (!blob) return;
    setError(null);
    try {
      setPhase("transcribing");
      const fd = new FormData();
      fd.append("audio", blob, "meeting.webm");
      const t = await fetch("/api/transcribe", { method: "POST", body: fd });
      const tj = await t.json();
      if (!t.ok) throw new Error(tj.error ?? "Transcription failed");
      const segs: TranscriptSegment[] = tj.segments;
      setSegments(segs);
      if (segs.length === 0) throw new Error("No speech was detected in the recording.");

      setPhase("extracting");
      const e = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ segments: segs }),
      });
      const ej = await e.json();
      if (!e.ok) throw new Error(ej.error ?? "Extraction failed");
      setNotes(ej.notes);
      setPhase("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPhase("recorded");
    }
  }

  const mm = Math.floor(elapsed / 60).toString().padStart(2, "0");
  const ss = (elapsed % 60).toString().padStart(2, "0");

  return (
    <section className="flex flex-col gap-6 pt-10">
      <div className="glass p-6">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {phase === "recording" ? <span className="rec-dot" /> : null}
            <h2 className="text-xl font-semibold">
              {phase === "idle" && "Ready to record"}
              {phase === "recording" && "Recording"}
              {phase === "recorded" && "Recording finished"}
              {phase === "transcribing" && "Transcribing…"}
              {phase === "extracting" && "Pulling out notes and tasks…"}
              {phase === "done" && "Done"}
            </h2>
          </div>
          <span className="font-mono text-2xl tabular-nums text-muted">{mm}:{ss}</span>
        </div>

        <canvas
          ref={canvasRef}
          width={1000}
          height={120}
          className="mb-4 h-[120px] w-full rounded-xl bg-black/30"
        />

        {hasSystemAudio === false && phase === "recording" ? (
          <p className="mb-3 text-sm text-danger">
            Only your microphone is being recorded. Next time, tick “Share audio” in the picker to capture the other participants.
          </p>
        ) : null}
        {error ? <p className="mb-3 text-sm text-danger">{error}</p> : null}

        <div className="flex flex-wrap gap-3">
          {phase === "idle" || phase === "done" ? (
            <button className="btn btn-primary" onClick={start}>
              Choose window and record
            </button>
          ) : null}
          {phase === "recording" ? (
            <button className="btn btn-danger" onClick={stop}>Stop</button>
          ) : null}
          {phase === "recorded" && blob ? (
            <>
              <button className="btn btn-primary" onClick={process}>Transcribe and extract</button>
              <a className="btn btn-ghost" href={URL.createObjectURL(blob)} download="meeting.webm">
                Download audio
              </a>
              <button className="btn btn-ghost" onClick={start}>Record again</button>
            </>
          ) : null}
        </div>

        <p className="mt-4 text-xs text-muted">
          Before recording, make sure everyone on the call knows and agrees. Audio stays in your browser until you click
          “Transcribe and extract”.
        </p>
      </div>

      {notes ? <NotesView notes={notes} /> : null}
      {segments ? <TranscriptView segments={segments} /> : null}
    </section>
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
            {notes.key_points.map((k) => <li key={k}>{k}</li>)}
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
            {notes.open_questions.map((q) => <li key={q}>{q}</li>)}
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
            <span className="text-muted">[{Math.floor(s.start / 60)}:{Math.floor(s.start % 60).toString().padStart(2, "0")}]</span>{" "}
            <span className="text-accent">{s.speaker}:</span> {s.text}
          </p>
        ))}
      </div>
    </details>
  );
}
