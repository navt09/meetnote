"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { NotesView, TranscriptView } from "@/components/notes";
import type { TicketDestination } from "@/lib/ticket-destination";
import { NotesSkeleton, ProcessingStepper, StatusPill } from "@/components/ui";
import { useToast } from "@/components/toast";
import { isSettling, type PublicMeeting } from "@/lib/meeting";
import { notesToMarkdown } from "@/lib/markdown";
import { formatTimestamp } from "@/lib/transcript";
import { formatUsd } from "@/lib/cost";
import { fetchMeeting, patchJson, startProcessing } from "@/lib/upload";
import DeleteMeetingButton from "@/app/notes/delete-button";
import type { Tier } from "@/lib/account";

const POLL_MS = 2500;

const WORKING_COPY: Record<string, string> = {
  uploaded: "Queued, starting shortly",
  transcribing: "Turning the audio into text",
  transcribed: "Transcript ready, writing the notes",
  extracting: "Pulling out tasks, decisions and people",
};

export default function MeetingView({ tier, ticketDestination }: { tier: Tier; ticketDestination: TicketDestination }) {
  const { id } = useParams<{ id: string }>();
  const toast = useToast();
  const [meeting, setMeeting] = useState<PublicMeeting | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const timerRef = useRef(0);
  const wasWorking = useRef(false);

  const load = useCallback(async () => {
    try {
      const m = await fetchMeeting(id);
      setMeeting(m);
      setLoadError(null);
      return m;
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Could not load this meeting.");
      return null;
    }
  }, [id]);

  // Poll while the pipeline is working; stop the moment it settles.
  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      const m = await load();
      if (cancelled) return;
      const working = !m || isSettling(m.status);
      if (working) {
        wasWorking.current = true;
        timerRef.current = window.setTimeout(tick, POLL_MS);
      } else if (wasWorking.current && m?.status === "done") {
        wasWorking.current = false;
        toast("Your notes are ready", "ok");
      }
    };
    tick();
    return () => {
      cancelled = true;
      window.clearTimeout(timerRef.current);
    };
  }, [load, toast]);

  async function retry() {
    try {
      await startProcessing(id);
      toast("Processing restarted", "ok");
      const m = await load();
      if (m && isSettling(m.status)) {
        wasWorking.current = true;
        timerRef.current = window.setTimeout(async function tick() {
          const mm = await load();
          if (mm && isSettling(mm.status)) timerRef.current = window.setTimeout(tick, POLL_MS);
          else if (mm?.status === "done") toast("Your notes are ready", "ok");
        }, POLL_MS);
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not restart processing", "error");
    }
  }

  async function saveTitle() {
    const title = draft.trim();
    setEditing(false);
    if (!meeting || !title || title === meeting.title) return;
    const previous = meeting.title;
    setMeeting({ ...meeting, title });
    try {
      await patchJson(`/api/meetings/${id}`, { title });
    } catch (err) {
      setMeeting((m) => (m ? { ...m, title: previous } : m));
      toast(err instanceof Error ? err.message : "Rename failed", "error");
    }
  }

  async function copyMarkdown() {
    if (!meeting?.notes) return;
    try {
      await navigator.clipboard.writeText(notesToMarkdown({ ...meeting.notes, title: meeting.title }, new Date(meeting.recordedAt)));
      setCopied(true);
      toast("Notes copied as Markdown", "ok");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast("Couldn't access the clipboard", "error");
    }
  }

  if (!meeting && !loadError) {
    return (
      <section className="flex flex-col gap-6 pt-10">
        <div className="skeleton h-9 w-2/3 max-w-md" />
        <NotesSkeleton />
      </section>
    );
  }

  if (!meeting) {
    return (
      <section className="pt-10">
        <div className="glass pop p-8 text-center">
          <p className="text-sm text-danger">{loadError}</p>
          <Link href="/notes" className="btn btn-ghost mt-4">Back to notes</Link>
        </div>
      </section>
    );
  }

  const working = isSettling(meeting.status);

  return (
    <section className="flex flex-col gap-6 pt-10">
      <div className="rise">
        <Link href="/notes" className="inline-flex items-center gap-1.5 text-xs text-muted transition-colors hover:text-fg">
          <span aria-hidden>←</span> All notes
        </Link>

        <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
          {editing ? (
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={saveTitle}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveTitle();
                if (e.key === "Escape") setEditing(false);
              }}
              className="field display min-w-0 flex-1 !py-1.5 text-2xl"
            />
          ) : (
            <h1
              className="group display cursor-text text-4xl"
              title="Click to rename"
              onClick={() => {
                setDraft(meeting.title);
                setEditing(true);
              }}
            >
              {meeting.title}
              <span className="ml-2 align-middle text-xs text-muted opacity-0 transition-opacity group-hover:opacity-100">edit</span>
            </h1>
          )}
          <StatusPill status={meeting.status} />
        </div>

        <p className="mt-2 text-xs text-muted">
          {new Date(meeting.recordedAt).toLocaleString(undefined, { dateStyle: "full", timeStyle: "short" })}
          {meeting.durationSeconds ? ` · ${formatTimestamp(meeting.durationSeconds)}` : ""}
          {meeting.internal ? ` · ${formatUsd(meeting.internal.costUsd)} · ${meeting.internal.inputTokens}/${meeting.internal.outputTokens} tokens` : ""}
        </p>
      </div>

      {working ? (
        <div className="glass rise p-6">
          <p className="mb-4 text-sm font-medium">
            <span className="dots">{WORKING_COPY[meeting.status] ?? "Working"}</span>
          </p>
          <ProcessingStepper status={meeting.status} />
          <p className="mt-4 text-xs text-muted">You can close this tab. It keeps going and will be here when you come back.</p>
        </div>
      ) : null}

      {meeting.status === "error" ? (
        <div className="glass pop border-danger/40 p-6">
          <p className="text-sm text-danger">{meeting.error ?? "Processing didn't finish."}</p>
          <button className="btn btn-primary mt-4 !px-4 !py-2 text-sm" onClick={retry}>Try again</button>
        </div>
      ) : null}

      {meeting.notes || meeting.hasAudio ? (
        <div className="rise flex flex-wrap justify-end gap-2">
          {meeting.notes ? (
            <button className="btn btn-ghost !px-3 !py-1.5 text-xs" onClick={copyMarkdown}>{copied ? "Copied ✓" : "Copy as Markdown"}</button>
          ) : null}
          {meeting.hasAudio ? (
            <a className="btn btn-ghost !px-3 !py-1.5 text-xs" href={`/api/meetings/${id}/audio`}>Download audio</a>
          ) : null}
          <DeleteMeetingButton id={id} afterDelete="list" />
        </div>
      ) : null}

      {meeting.notes ? <NotesView notes={meeting.notes} meetingId={id} tier={tier} ticketDestination={ticketDestination} /> : working ? <NotesSkeleton /> : null}
      {meeting.transcript?.length ? <TranscriptView segments={meeting.transcript} /> : null}
    </section>
  );
}
