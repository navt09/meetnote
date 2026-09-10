"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getJson, postJson } from "@/lib/upload";
import { useToast } from "@/components/toast";
import { kindLabel, type PublicTask } from "@/lib/task";
import type { ActionItem } from "@/lib/schema";

const PRIORITY = {
  high: { label: "High", pill: "pill-danger", stripe: "var(--danger)" },
  medium: { label: "Medium", pill: "pill-warn", stripe: "var(--warn)" },
  low: { label: "Low", pill: "", stripe: "var(--panel-border-hi)" },
} as const;

/**
 * A meeting's action items, with the things you can do to them.
 *
 * Renders the rows from the tasks table rather than from the notes JSON, even
 * though they hold the same words. Tasks are the live copy: they carry the
 * done tick, the drafted ticket and the calendar link, and the buttons need a
 * task id to act on. The notes are only a fallback for a meeting whose tasks
 * have not synced.
 *
 * The actions are the same ones the Tasks page offers, put where people
 * actually read the meeting.
 */
export function ActionItems({ meetingId, fallback }: { meetingId: string; fallback: ActionItem[] }) {
  const toast = useToast();
  const [tasks, setTasks] = useState<PublicTask[] | null>(null);
  const [drafted, setDrafted] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const [t, d] = await Promise.all([
          getJson<{ tasks: PublicTask[] }>(`/api/tasks?meetingId=${meetingId}`),
          getJson<{ drafts: { taskId: string | null }[] }>("/api/drafts"),
        ]);
        if (!live) return;
        setTasks(t.tasks);
        setDrafted(new Set(d.drafts.map((x) => x.taskId).filter((x): x is string => !!x)));
      } catch {
        // The notes still render from the fallback; only the buttons are lost.
        if (live) setTasks([]);
      }
    })();
    return () => {
      live = false;
    };
  }, [meetingId]);

  async function draftTicket(task: PublicTask) {
    setBusy(task.id);
    try {
      await postJson(`/api/tasks/${task.id}/draft`, {});
      setDrafted((prev) => new Set(prev).add(task.id));
      toast("Ticket drafted. Read it in Approvals before it goes anywhere.", "ok");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not draft that ticket", "error");
    } finally {
      setBusy(null);
    }
  }

  async function addToCalendar(task: PublicTask) {
    setBusy(task.id);
    try {
      const res = await postJson<{ url: string }>(`/api/tasks/${task.id}/calendar`, {});
      setTasks((list) => (list ?? []).map((t) => (t.id === task.id ? { ...t, calendarEventUrl: res.url } : t)));
      toast("Blocked out on your calendar. Nobody else was invited.", "ok");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not add that to your calendar", "error");
    } finally {
      setBusy(null);
    }
  }

  // Before the tasks land, show the notes' own copy so the page is never empty.
  const rows: (PublicTask | ActionItem)[] = tasks && tasks.length > 0 ? tasks : fallback;
  const live = !!tasks && tasks.length > 0;

  if (rows.length === 0) {
    return <p className="mt-4 text-sm text-muted">Nothing to do came out of this one.</p>;
  }

  return (
    <ul className="mt-4 flex flex-col gap-2.5">
      {rows.map((row, i) => {
        const task = live ? (row as PublicTask) : null;
        const p = PRIORITY[row.priority as keyof typeof PRIORITY] ?? PRIORITY.low;
        const done = task?.status === "done";
        return (
          <li
            key={task?.id ?? i}
            className="rounded-lg border border-panel-border bg-bg-elev p-4"
            style={{ borderLeftWidth: "3px", borderLeftColor: done ? "var(--panel-border-hi)" : p.stripe }}
          >
            <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1.5">
              <p className={`font-medium leading-snug ${done ? "text-muted line-through decoration-faint" : ""}`}>{row.title}</p>
              {done ? <span className="pill pill-ok shrink-0">Done</span> : <span className={`pill ${p.pill} shrink-0`}>{p.label}</span>}
            </div>
            {row.details ? <p className="mt-1.5 text-sm leading-relaxed text-muted">{row.details}</p> : null}

            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs">
              <span className={row.owner ? "font-medium text-fg" : "text-faint"}>{row.owner ?? "Unassigned"}</span>
              <span className="text-faint">{kindLabel(row.kind)}</span>
              {row.due ? <span className="text-warn">due {row.due}</span> : null}

              {task ? (
                <>
                  <span aria-hidden className="text-faint">·</span>
                  {drafted.has(task.id) ? (
                    <Link href="/approvals" className="text-accent transition-colors hover:underline">ticket drafted</Link>
                  ) : (
                    <button
                      onClick={() => draftTicket(task)}
                      disabled={busy === task.id}
                      className="text-muted transition-colors hover:text-fg disabled:opacity-50"
                    >
                      {busy === task.id ? "working…" : "draft ticket"}
                    </button>
                  )}
                  {task.calendarEventUrl ? (
                    <a href={task.calendarEventUrl} target="_blank" rel="noreferrer" className="text-accent transition-colors hover:underline">
                      on your calendar
                    </a>
                  ) : (
                    <button
                      onClick={() => addToCalendar(task)}
                      disabled={busy === task.id}
                      className="text-muted transition-colors hover:text-fg disabled:opacity-50"
                    >
                      add to calendar
                    </button>
                  )}
                </>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
