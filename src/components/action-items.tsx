"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getJson, postJson } from "@/lib/upload";
import { useToast } from "@/components/toast";
import { kindLabel, personToEmail, type ContactPerson, type PublicTask } from "@/lib/task";
import type { QuoteContext } from "@/lib/quote-context";
import type { ActionItem } from "@/lib/schema";
import { PriorityFlag } from "@/components/priority";
import { canConnect, canDraft, type Tier } from "@/lib/account";
import { isUpgradeError, upgradeMessage, UpgradeNote } from "@/components/upgrade";

/**
 * The material behind a task: what was said about it, the words that produced
 * it, and where to start. Every part is optional, and an old task has none.
 */
export type TaskContext = {
  details?: string | null;
  quote?: string | null;
  firstStep?: string | null;
  owner?: string | null;
  /** What was said either side of the quote. Absent on anything but a live task. */
  around?: QuoteContext | null;
};

/** Whether there is anything to expand. An expander that reveals nothing is worse than none. */
export function hasContext(c: TaskContext): boolean {
  return !!(c.details?.trim() || c.quote?.trim() || c.firstStep?.trim());
}

/**
 * The title, as the thing you press to open a task.
 *
 * The row itself cannot be the button: it holds a checkbox, a draft button and
 * two links, and a button may not contain those. Pressing the title is the
 * next most obvious target, and it carries the aria state for the panel.
 */
export function TaskTitle({
  title,
  done,
  expandable,
  open,
  panelId,
  onToggle,
}: {
  title: string;
  done: boolean;
  expandable: boolean;
  open: boolean;
  panelId: string;
  onToggle: () => void;
}) {
  const text = `font-medium leading-snug ${done ? "text-faint line-through" : ""}`;
  if (!expandable) return <p className={text}>{title}</p>;
  return (
    <button type="button" onClick={onToggle} aria-expanded={open} aria-controls={panelId} className="task-toggle min-w-0">
      <span aria-hidden className="task-caret">▸</span>
      <span className={text}>{title}</span>
    </button>
  );
}

/** One line of transcript either side of the quote, named and quieter. */
function Around({ line }: { line: { speaker: string; text: string } }) {
  return (
    <p className="task-around text-xs leading-relaxed text-faint">
      <span className="font-medium">{line.speaker}:</span> {line.text}
    </p>
  );
}

/**
 * What a task looks like once it is open.
 *
 * The quote is marked as words somebody said and attributed where there is an
 * owner, because its whole job is to let a person check the task against the
 * meeting. The first step is marked as a suggestion in the label and again
 * underneath: it is the one part of a task the meeting did not decide.
 */
export function TaskContextPanel({ id, context }: { id: string; context: TaskContext }) {
  const { details, quote, firstStep, owner, around } = context;
  return (
    <div id={id} className="task-detail mt-2 flex flex-col gap-3">
      {details ? <p className="text-sm leading-relaxed text-muted">{details}</p> : null}

      {quote ? (
        <figure className="task-quote">
          {/* The lines either side are set back and dimmed, because they are
              there to explain the quote, not to compete with it. Either may be
              missing: a quote can open or close a meeting. */}
          {around?.before ? <Around line={around.before} /> : null}
          <blockquote className="text-sm leading-relaxed text-fg">
            {/* With neighbours around it the quote is one line of a
                conversation, so it is named the same way they are. A caption
                underneath would sit between the quote and the reply and read
                as if it belonged to whichever line came next. */}
            {around && owner ? <span className="font-medium text-muted">{owner}: </span> : null}
            “{quote}”
          </blockquote>
          {around?.after ? <Around line={around.after} /> : null}
          {!around ? (
            <figcaption className="mt-1 text-xs text-faint">{owner ? `${owner} said this` : "Said in the meeting"}</figcaption>
          ) : null}
        </figure>
      ) : null}

      {firstStep ? (
        <div>
          <p className="text-xs font-semibold text-fg">Suggested first step</p>
          <p className="mt-0.5 text-sm leading-relaxed text-muted">{firstStep}</p>
          <p className="mt-0.5 text-xs text-faint">A suggestion from the notes, not something the meeting decided.</p>
        </div>
      ) : null}
    </div>
  );
}

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
  const [open, setOpen] = useState<Set<string>>(new Set());

  function toggleOpen(key: string) {
    setOpen((prev) => {
      const next = new Set(prev);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  }

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
        // The live task and the notes' own copy hold the same three things
        // under different names, so the row is read through one shape.
        const context: TaskContext = task
          ? { details: task.details, quote: task.quote, firstStep: task.firstStep, owner: task.owner, around: task.quoteContext }
          : {
              details: row.details,
              quote: (row as ActionItem).quote,
              firstStep: (row as ActionItem).first_step,
              owner: row.owner,
            };
        const key = task?.id ?? String(i);
        const expandable = hasContext(context);
        const isOpen = expandable && open.has(key);
        const panelId = `task-context-${key}`;
        return (
          <li key={key} className="band-row">
            <div className="flex items-start justify-between gap-3">
              <TaskTitle
                title={row.title}
                done={done}
                expandable={expandable}
                open={isOpen}
                panelId={panelId}
                onToggle={() => toggleOpen(key)}
              />
              <PriorityFlag priority={row.priority} done={done} />
            </div>
            {isOpen ? (
              <TaskContextPanel id={panelId} context={context} />
            ) : row.details ? (
              // Collapsed, the details are a preview: two lines, then the rest
              // is behind the title.
              <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-muted">{row.details}</p>
            ) : null}

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
