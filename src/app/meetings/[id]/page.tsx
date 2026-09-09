"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { CostLine, NotesView, TranscriptView } from "@/components/notes";
import { isInProgress, statusLabel, type Meeting } from "@/lib/meeting";
import { notesToMarkdown } from "@/lib/markdown";
import { fetchMeeting, startProcessing } from "@/lib/upload";
import DeleteMeetingButton from "../delete-button";

const POLL_MS = 3000;

export default function MeetingPage() {
  const { id } = useParams<{ id: string }>();
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const timerRef = useRef(0);

  const load = useCallback(async () => {
    try {
      const m = await fetchMeeting(id);
      setMeeting(m);
      setError(null);
      return m;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load meeting");
      return null;
    }
  }, [id]);

  // Poll while the pipeline is working; stop as soon as it settles.
  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      const m = await load();
      if (cancelled) return;
      const busy = !m || isInProgress(m.status) || m.status === "uploaded" || m.status === "transcribed";
      if (busy) timerRef.current = window.setTimeout(tick, POLL_MS);
    };
    tick();
    return () => {
      cancelled = true;
      window.clearTimeout(timerRef.current);
    };
  }, [load]);

  async function retry() {
    setError(null);
    try {
      await startProcessing(id);
      const m = await load();
      if (m && (isInProgress(m.status) || m.status === "uploaded" || m.status === "transcribed")) {
        timerRef.current = window.setTimeout(async function tick() {
          const mm = await load();
          if (mm && (isInProgress(mm.status) || mm.status === "uploaded" || mm.status === "transcribed")) {
            timerRef.current = window.setTimeout(tick, POLL_MS);
          }
        }, POLL_MS);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not restart processing");
    }
  }

  async function saveTitle() {
    const title = titleDraft.trim();
    setEditingTitle(false);
    if (!meeting || !title || title === meeting.title) return;
    try {
      await postJsonPatch(`/api/meetings/${id}`, { title });
      setMeeting({ ...meeting, title });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Rename failed");
    }
  }

  async function copyMarkdown() {
    if (!meeting?.notes) return;
    try {
      await navigator.clipboard.writeText(notesToMarkdown({ ...meeting.notes, title: meeting.title }, new Date(meeting.recorded_at)));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Couldn't access the clipboard.");
    }
  }

  if (!meeting && !error) return <p className="pt-10 text-sm text-muted">Loading…</p>;
  if (!meeting) {
    return (
      <section className="pt-10">
        <p className="text-sm text-danger">{error}</p>
        <Link href="/meetings" className="btn btn-ghost mt-4">Back to meetings</Link>
      </section>
    );
  }

  const working = isInProgress(meeting.status) || meeting.status === "uploaded" || meeting.status === "transcribed";

  return (
    <section className="flex flex-col gap-6 pt-10">
      <div>
        <Link href="/meetings" className="text-xs text-muted hover:text-fg">← All meetings</Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          {editingTitle ? (
            <input
              autoFocus
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={saveTitle}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveTitle();
                if (e.key === "Escape") setEditingTitle(false);
              }}
              className="min-w-0 flex-1 rounded-lg border border-panel-border bg-black/30 px-3 py-1.5 text-2xl font-semibold outline-none focus:border-accent"
            />
          ) : (
            <h1
              className="cursor-text text-2xl font-semibold hover:text-accent"
              title="Click to rename"
              onClick={() => {
                setTitleDraft(meeting.title);
                setEditingTitle(true);
              }}
            >
              {meeting.title}
            </h1>
          )}
          <span className={`pill ${meeting.status === "error" ? "text-danger" : meeting.status === "done" ? "text-ok" : ""}`}>
            {working ? <span className="rec-dot !bg-accent" /> : null}
            {statusLabel(meeting.status)}
          </span>
        </div>
        <p className="mt-1 text-xs text-muted">{new Date(meeting.recorded_at).toLocaleString()}</p>
      </div>

      {working ? (
        <div className="glass p-5 text-sm text-muted">
          {meeting.status === "transcribing" ? "Turning the audio into text…" : meeting.status === "extracting" ? "Pulling out the notes and tasks…" : "Queued…"}
          {" "}You can close this tab; it keeps going.
        </div>
      ) : null}

      {meeting.status === "error" ? (
        <div className="glass border-danger/40 p-5">
          <p className="text-sm text-danger">{meeting.error ?? "Processing failed."}</p>
          <button className="btn btn-primary mt-3 !px-4 !py-2 text-sm" onClick={retry}>Try again</button>
        </div>
      ) : null}
      {error ? <p className="text-sm text-danger">{error}</p> : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        {meeting.status === "done" ? (
          <CostLine
            durationSeconds={Number(meeting.duration_seconds ?? 0)}
            transcriptionUsd={Number(meeting.transcription_cost_usd)}
            llmUsd={Number(meeting.llm_cost_usd)}
          />
        ) : <span />}
        <div className="flex flex-wrap gap-2">
          {meeting.notes ? <button className="btn btn-ghost !px-3 !py-1.5 text-xs" onClick={copyMarkdown}>{copied ? "Copied" : "Copy as Markdown"}</button> : null}
          {meeting.storage_path ? <a className="btn btn-ghost !px-3 !py-1.5 text-xs" href={`/api/meetings/${id}/audio`}>Download audio</a> : null}
          <DeleteMeetingButton id={id} afterDelete="list" />
        </div>
      </div>

      {meeting.notes ? <NotesView notes={meeting.notes} /> : null}
      {meeting.transcript?.length ? <TranscriptView segments={meeting.transcript} /> : null}
    </section>
  );
}

async function postJsonPatch(url: string, body: unknown) {
  const res = await fetch(url, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? `Request failed (${res.status})`);
  return json;
}
