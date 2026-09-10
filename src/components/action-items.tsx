"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getJson, postJson } from "@/lib/upload";
import { useToast } from "@/components/toast";
import { kindLabel, personToEmail, type ContactPerson, type PublicTask } from "@/lib/task";
import type { ActionItem } from "@/lib/schema";
import { PriorityFlag } from "@/components/priority";
import { canConnect, canDraft, type Tier } from "@/lib/account";
import { isUpgradeError, upgradeMessage, UpgradeNote } from "@/components/upgrade";

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
 *
 * `people` is this meeting's people_to_contact. A task that says to get in
 * touch with one of them is an email, not a ticket, so it is offered as one.
 */
export function ActionItems({
  meetingId,
  fallback,
  people,
  tier,
}: {
  meetingId: string;
  fallback: ActionItem[];
  people: ContactPerson[];
  tier: Tier;
}) {
  const toast = useToast();
  const mayDraft = canDraft(tier);
  const mayConnect = canConnect(tier);
  const [tasks, setTasks] = useState<PublicTask[] | null>(null);
  const [drafted, setDrafted] = useState<Set<string>>(new Set());
  // Email drafts carry no task id, so unlike tickets they cannot be read back
  // from /api/drafts against a task. This remembers the ones drafted here.
  const [emailed, setEmailed] = useState<Set<string>>(new Set());
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
      // The tier can change between this page loading and this click, so a
      // refusal is explained rather than shown as a raw failure.
      const fallbackMessage = err instanceof Error ? err.message : "Could not draft that ticket";
      toast(isUpgradeError(err) ? upgradeMessage("draft", fallbackMessage) : fallbackMessage, "error");
    } finally {
      setBusy(null);
    }
  }

  /** The recipient is one the meeting itself flagged; the route refuses any other. */
  async function draftEmail(task: PublicTask, name: string) {
    setBusy(task.id);
    try {
      await postJson(`/api/meetings/${meetingId}/draft-email`, { name });
      setEmailed((prev) => new Set(prev).add(task.id));
      toast("Email drafted. Read it in Approvals before it goes anywhere.", "ok");
    } catch (err) {
      const fallbackMessage = err instanceof Error ? err.message : "Could not draft that email";
      toast(isUpgradeError(err) ? upgradeMessage("draft", fallbackMessage) : fallbackMessage, "error");
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
      const fallbackMessage = err instanceof Error ? err.message : "Could not add that to your calendar";
      toast(isUpgradeError(err) ? upgradeMessage("connect", fallbackMessage) : fallbackMessage, "error");
    } finally {
      setBusy(null);
    }
  }

  // Before the tasks land, show the notes' own copy so the page is never empty.
  const rows: (PublicTask | ActionItem)[] = tasks && tasks.length > 0 ? tasks : fallback;
  const live = !!tasks && tasks.length > 0;

  if (rows.length === 0) {
    return <p className="band-empty text-sm text-muted">Nothing to do came out of this one.</p>;
  }

  return (
    <ul className="band-body">
      {rows.map((row, i) => {
        const task = live ? (row as PublicTask) : null;
        const done = task?.status === "done";
        // "Email Priya about the icons" wants an email, not a ticket.
        const emailTo = task ? personToEmail(task, people) : null;
        return (
          <li key={task?.id ?? i} className="band-row">
            <div className="flex items-start justify-between gap-3">
              <p className={`font-medium leading-snug ${done ? "text-faint line-through" : ""}`}>{row.title}</p>
              <PriorityFlag priority={row.priority} done={done} />
            </div>
            {row.details ? <p className="mt-1 text-sm leading-relaxed text-muted">{row.details}</p> : null}

            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-faint">
              <span className={row.owner ? "font-medium text-fg" : ""}>{row.owner ?? "Unassigned"}</span>
              <span>{kindLabel(row.kind)}</span>
              {row.due ? <span className="font-medium text-warn">due {row.due}</span> : null}

              {task ? (
                <>
                  {/* Work already done stays visible even on a tier that could
                      not start it now, so a downgrade never hides a real ticket. */}
                  {emailTo ? (
                    emailed.has(task.id) ? (
                      <Link href="/approvals" className="font-medium text-accent transition-opacity hover:opacity-70">email drafted</Link>
                    ) : mayDraft ? (
                      <button
                        onClick={() => draftEmail(task, emailTo)}
                        disabled={busy === task.id}
                        className="font-medium text-accent transition-opacity hover:opacity-70 disabled:opacity-50"
                      >
                        {busy === task.id ? "working…" : "draft email"}
                      </button>
                    ) : null
                  ) : drafted.has(task.id) ? (
                    <Link href="/approvals" className="font-medium text-accent transition-opacity hover:opacity-70">ticket drafted</Link>
                  ) : mayDraft ? (
                    <button
                      onClick={() => draftTicket(task)}
                      disabled={busy === task.id}
                      className="font-medium text-accent transition-opacity hover:opacity-70 disabled:opacity-50"
                    >
                      {busy === task.id ? "working…" : "draft ticket"}
                    </button>
                  ) : null}
                  {task.calendarEventUrl ? (
                    <a href={task.calendarEventUrl} target="_blank" rel="noreferrer" className="font-medium text-accent transition-opacity hover:opacity-70">
                      on your calendar
                    </a>
                  ) : mayConnect ? (
                    <button
                      onClick={() => addToCalendar(task)}
                      disabled={busy === task.id}
                      className="font-medium text-accent transition-opacity hover:opacity-70 disabled:opacity-50"
                    >
                      add to calendar
                    </button>
                  ) : null}
                  {/* One line per row, not one per missing button: both walls
                      open on the same tier, and saying it twice on every task
                      would drown the tasks. */}
                  {!mayDraft || !mayConnect ? <UpgradeNote reason={!mayDraft ? "draft" : "connect"} /> : null}
                </>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
