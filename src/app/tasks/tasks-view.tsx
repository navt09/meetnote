"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { patchJson, postJson } from "@/lib/upload";
import { useToast } from "@/components/toast";
import { EmptyState, PageHead } from "@/components/ui";
import {
  filterTasks,
  kindLabel,
    personToEmail,
  sortTasks,
  type ContactPerson,
  type PublicTask,
  type TaskFilter,
} from "@/lib/task";
import { PriorityFlag } from "@/components/priority";
// The two task lists expand the same way and say the same things when open, so
// the pieces live once, beside the meeting page's list.
import { hasContext, TaskContextPanel, TaskTitle, type TaskContext } from "@/components/action-items";
import { canConnect, canDraft, type Tier } from "@/lib/account";
import { isUpgradeError, upgradeMessage, UpgradeNote } from "@/components/upgrade";
import { emailDraftKey } from "@/lib/draft";

const FILTERS: { key: TaskFilter; label: string }[] = [
  { key: "open", label: "To do" },
  { key: "done", label: "Done" },
  { key: "all", label: "All" },
];

/** Everything a row can open to show, read off a task. */
const contextOf = (t: PublicTask): TaskContext => ({
  details: t.details,
  quote: t.quote,
  firstStep: t.firstStep,
  owner: t.owner,
  around: t.quoteContext,
  blockedBy: t.blockedBy,
});

/** One deadline, dated on the server where "Thursday" has a fixed meaning. */
export type DueEntry = { id: string; label: string; overdue: boolean };

export default function TasksView({
  initial,
  loadError,
  drafted,
  emailedKeys,
  due,
  people,
  me,
  hiddenFromOthers,
  requestedTaskId,
  tier,
}: {
  initial: PublicTask[];
  loadError: string | null;
  drafted: string[];
  /** Meeting-and-recipient keys that already have an email draft. */
  emailedKeys: string[];
  due: DueEntry[];
  tier: Tier;
  /** Each task's meeting's people_to_contact, keyed by meeting id. */
  people: Record<string, ContactPerson[]>;
  /** The reader's own name, as set in Settings. Null if they never set one. */
  me: string | null;
  /** How many tasks on their meetings belong to somebody else. */
  hiddenFromOthers: number;
  /** A task linked to from elsewhere, e.g. Home's "Top of the list". */
  requestedTaskId: string | null;
}) {
  const toast = useToast();
  const router = useRouter();
  const mayDraft = canDraft(tier);
  const mayConnect = canConnect(tier);
  const [tasks, setTasks] = useState<PublicTask[]>(initial);
  // Landing on a particular task opens on every task, because the one being
  // asked for may well be done. Derived at mount rather than set from an
  // effect, so the first render is already right.
  const [filter, setFilter] = useState<TaskFilter>(requestedTaskId ? "all" : "open");
  // This tab is "my tasks": it opens on the reader's own. Only when their name
  // is actually one of the owners, though. Opening on a filter that matches
  // nothing looks like a broken page rather than a filtered one. Derived at
  // mount for the same reason the filter above is. Needing a second owner is
  // not pedantry: the chips, and with them the way back to Everyone, are only
  // Both derived from the drafts the page was rendered with, rather than
  // remembered from a press: drafting now happens on Approvals, so the only
  // honest source for "already drafted" is the drafts themselves. A ticket is
  // recognised by its task, an email by who it is for.
  const hasDraft = useMemo(() => new Set(drafted), [drafted]);
  const emailed = useMemo(() => new Set(emailedKeys), [emailedKeys]);
  const [drafting, setDrafting] = useState<string | null>(null);
  // Hidden for the whole page once Microsoft turns out not to be there.
  const [todoOff, setTodoOff] = useState(false);
  const [scheduling, setScheduling] = useState<string | null>(null);
  // The row to jump to. Carries a counter so picking the same deadline twice
  // in a row still moves and flashes.
  const [target, setTarget] = useState<{ id: string; n: number } | null>(
    requestedTaskId ? { id: requestedTaskId, n: 0 } : null,
  );
  // Which rows are open. Someone who arrived on a particular task came to look
  // at that one, so it starts open when it has anything to show. Computed at
  // mount rather than from an effect, so the first render is already right and
  // the jump is untouched either way.
  const [open, setOpen] = useState<Set<string>>(() => {
    const landed = requestedTaskId ? initial.find((t) => t.id === requestedTaskId) : null;
    return new Set(landed && hasContext(contextOf(landed)) ? [landed.id] : []);
  });
  const error = loadError;

  /** Blocks time out on the user's own calendar. Nobody else is invited or emailed. */
  /* Straight onto the list, with no draft in between: a task on your own list
     is the words the meeting already agreed, and a model would spend eight
     seconds arriving back at them. One refusal hides it for the whole page
     rather than leaving a standing complaint about Settings on every row. */
  async function addToTodo(task: PublicTask) {
    setScheduling(task.id);
    try {
      await postJson(`/api/tasks/${task.id}/todo`, {});
      setTasks((list) => list.map((t) => (t.id === task.id ? { ...t, onTodo: true } : t)));
      toast("Added to your Microsoft To Do list.", "ok");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not add that to To Do";
      if (/connect microsoft|cannot reach your tasks/i.test(message)) setTodoOff(true);
      else toast(isUpgradeError(err) ? upgradeMessage("connect", message) : message, "error");
    } finally {
      setScheduling(null);
    }
  }

  async function addToCalendar(task: PublicTask) {
    setScheduling(task.id);
    try {
      const res = await postJson<{ url: string; when: string }>(`/api/tasks/${task.id}/calendar`, {});
      setTasks((list) => list.map((t) => (t.id === task.id ? { ...t, calendarEventUrl: res.url } : t)));
      toast(`Blocked out ${res.when}`, "ok");
    } catch (err) {
      // The tier can change between this page loading and this click, so a
      // refusal is explained rather than shown as a raw failure.
      const fallbackMessage = err instanceof Error ? err.message : "Could not add that to your calendar";
      toast(isUpgradeError(err) ? upgradeMessage("connect", fallbackMessage) : fallbackMessage, "error");
    } finally {
      setScheduling(null);
    }
  }

  /* The model takes about eight seconds to write a ticket, and eight seconds
     of a disabled button here reads as a hang. So the press hands the job to
     Approvals and goes there: the wait then happens in front of the thing it
     is producing, on the page you were going to end up on anyway. */
  function draft(task: PublicTask) {
    setDrafting(task.id);
    router.push(`/approvals?for=ticket&id=${task.id}`);
  }

  /** The recipient is one that meeting itself flagged; the route refuses any other. */
  function draftEmail(task: PublicTask, name: string) {
    setDrafting(task.id);
    router.push(`/approvals?for=email&id=${task.meetingId}&who=${encodeURIComponent(name)}`);
  }

  // Built from the current tasks rather than the server's list, so ticking one
  // off drops it out of the deadlines without a round trip.
  const schedule = useMemo(() => {
    const byId = new Map(tasks.map((t) => [t.id, t]));
    return due.flatMap((d) => {
      const task = byId.get(d.id);
      return task && task.status === "open" ? [{ ...d, task }] : [];
    });
  }, [tasks, due]);

  // The same resolved deadline the list shows, so a row can never say
  // "Thursday" beside a list entry that calls it something else.
  const dueById = useMemo(() => new Map(due.map((d) => [d.id, d])), [due]);

  const visible = useMemo(() => sortTasks(filterTasks(tasks, filter)), [tasks, filter]);
  const openCount = useMemo(() => tasks.filter((t) => t.status === "open").length, [tasks]);

  // Drop the parameter once it has been acted on, so a refresh does not flash
  // the same row again.
  useEffect(() => {
    if (requestedTaskId) router.replace("/tasks", { scroll: false });
  }, [requestedTaskId, router]);

  // Scrolling happens in an effect, after the row it is looking for has been
  // rendered by the filter change that may have just been made.
  useEffect(() => {
    if (!target) return;
    document.getElementById(`task-${target.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    const id = setTimeout(() => setTarget(null), 1800);
    return () => clearTimeout(id);
  }, [target]);

  function toggleOpen(id: string) {
    setOpen((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }

  function jumpTo(id: string) {
    // A deadline is no use if pressing it lands on a filter that hides the row.
    if (!visible.some((t) => t.id === id)) {
      setFilter("all");
    }
    // Same reasoning as the landing case above: you pressed a deadline to look
    // at that task, so it arrives open if it has anything to show.
    const landed = tasks.find((t) => t.id === id);
    if (landed && hasContext(contextOf(landed))) setOpen((s) => new Set(s).add(id));
    setTarget((prev) => ({ id, n: (prev?.n ?? 0) + 1 }));
  }

  async function toggle(task: PublicTask) {
    const next = task.status === "done" ? "open" : "done";
    // Optimistic: flip it now, put it back if the server disagrees.
    setTasks((list) => list.map((t) => (t.id === task.id ? { ...t, status: next } : t)));
    try {
      await patchJson(`/api/tasks/${task.id}`, { status: next });
      if (next === "done") toast("Nice. Task done.", "ok");
    } catch (err) {
      setTasks((list) => list.map((t) => (t.id === task.id ? { ...t, status: task.status } : t)));
      toast(err instanceof Error ? err.message : "Could not update that task", "error");
    }
  }

  return (
    <section className="flex flex-col gap-6 pt-10">
      <PageHead
        title="Tasks"
        meta={
          <>
            {openCount === 0 ? "Nothing outstanding" : `${openCount} still to do`}
            {tasks.length > openCount ? ` · ${tasks.length - openCount} done` : ""}
            {/* Said plainly, so a short list reads as your list and not as a
                quiet week. Other people's work lives on the meeting it came
                from, which is where it is any use. */}
            {me && hiddenFromOthers > 0
              ? ` · yours only, ${hiddenFromOthers} more belong to other people`
              : null}
            {!me ? " · everyone's, until you add your name in Settings" : null}
          </>
        }
        action={<Link href="/record" className="btn btn-primary">New meeting</Link>}
      />

      {error ? <p className="glass p-4 text-sm text-danger">{error}</p> : null}

      {tasks.length > 0 ? (
        <div className="rise flex flex-wrap items-center gap-2">
          <div className="flex gap-0.5 rounded-lg border border-panel-border p-0.5">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`rounded-md px-2.5 py-1 text-xs transition-colors ${
                  filter === f.key ? "bg-panel-hi font-medium text-fg" : "text-muted hover:text-fg"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

        </div>
      ) : null}

      {tasks.length === 0 ? (
        <EmptyState
          title="No tasks yet"
          body="Record a meeting and every action item people agree to will land here, ready to tick off."
          action={<Link href="/record" className="btn btn-primary">Record a meeting</Link>}
        />
      ) : visible.length === 0 ? (
        <EmptyState
          title={filter === "open" ? "All caught up" : "Nothing here"}
          body={
            filter !== "open"
              ? "Try a different filter."
              : me
                ? "Everything assigned to you is done."
                : "Every task from your meetings is done."
          }
        />
      ) : null}

      <div className={schedule.length > 0 ? "grid gap-6 lg:grid-cols-[1fr_15rem] lg:items-start" : ""}>
      {visible.length > 0 ? (
        <section className="band band-work">
          <div className="band-head">
            <h2 className="band-title">Needs doing</h2>
            <span className="band-count">{visible.length}</span>
          </div>
          <ul className="band-body">
            {visible.map((t) => {
              const done = t.status === "done";
              // "Email Priya about the icons" wants an email, not a ticket.
              const emailTo = personToEmail(t, people[t.meetingId] ?? []);
              const context = contextOf(t);
              const expandable = hasContext(context);
              const isOpen = expandable && open.has(t.id);
              const panelId = `task-context-${t.id}`;
              return (
                <li key={t.id} id={`task-${t.id}`} className={`band-row scroll-mt-24 ${target?.id === t.id ? "task-flash" : ""}`}>
                  <div className="flex items-start gap-3">
                    <button
                      onClick={() => toggle(t)}
                      aria-label={done ? `Mark "${t.title}" as not done` : `Mark "${t.title}" as done`}
                      className={`mt-0.5 grid h-4 w-4 flex-none place-items-center rounded border text-[0.6rem] transition-colors ${
                        done ? "border-agreed bg-agreed text-[color:var(--bg)]" : "border-panel-border-hi hover:border-agreed"
                      }`}
                    >
                      {done ? "✓" : ""}
                    </button>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <TaskTitle
                          title={t.title}
                          done={done}
                          expandable={expandable}
                          open={isOpen}
                          panelId={panelId}
                          onToggle={() => toggleOpen(t.id)}
                        />
                        <PriorityFlag priority={t.priority} done={done} />
                      </div>
                      {isOpen ? (
                        <TaskContextPanel id={panelId} context={context} />
                      ) : t.details ? (
                        // Collapsed, the details are a preview: two lines, then
                        // the rest is behind the title.
                        <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-muted">{t.details}</p>
                      ) : null}

                      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-faint">
                        <span className={t.owner ? "font-medium text-fg" : ""}>{t.owner ?? "Unassigned"}</span>
                        <span>{kindLabel(t.kind)}</span>
                        {(() => {
                        const d = dueById.get(t.id);
                        if (d) {
                          return (
                            <span className={`font-medium ${d.overdue && !done ? "text-danger" : "text-warn"}`} title={t.due ?? undefined}>
                              due {d.label.toLowerCase()}
                            </span>
                          );
                        }
                        // Nothing concrete was said, so the words stand as they were.
                        return t.due ? <span className="font-medium text-warn">due {t.due}</span> : null;
                      })()}
                        {/* One word collapsed, the sentence on opening. A task
                            nobody can start should say so without being
                            opened, but the reason is a sentence and this line
                            is a strip of chips. */}
                        {t.blockedBy ? <span className="font-medium text-warn">blocked</span> : null}
                        {/* Work already done stays visible even on a tier that
                            could not start it now. */}
                        {emailTo ? (
                          emailed.has(emailDraftKey(t.meetingId, emailTo)) ? (
                            <Link href="/approvals" className="font-medium text-accent transition-opacity hover:opacity-70">email drafted</Link>
                          ) : mayDraft ? (
                            <button
                              onClick={() => draftEmail(t, emailTo)}
                              disabled={drafting === t.id}
                              className="font-medium text-accent transition-opacity hover:opacity-70 disabled:opacity-50"
                            >
                              {drafting === t.id ? "opening…" : "draft email"}
                            </button>
                          ) : null
                        ) : hasDraft.has(t.id) ? (
                          <Link href="/approvals" className="font-medium text-accent transition-opacity hover:opacity-70">follow-up drafted</Link>
                        ) : mayDraft ? (
                          <button
                            onClick={() => draft(t)}
                            disabled={drafting === t.id}
                            className="font-medium text-accent transition-opacity hover:opacity-70 disabled:opacity-50"
                          >
                            {drafting === t.id ? "opening…" : "draft follow-up"}
                          </button>
                        ) : null}
                        {t.calendarEventUrl ? (
                          <a href={t.calendarEventUrl} target="_blank" rel="noreferrer" className="font-medium text-accent transition-opacity hover:opacity-70">
                            on your calendar
                          </a>
                        ) : mayConnect ? (
                          <button
                            onClick={() => addToCalendar(t)}
                            disabled={scheduling === t.id}
                            className="font-medium text-accent transition-opacity hover:opacity-70 disabled:opacity-50"
                          >
                            {scheduling === t.id ? "adding…" : "add to calendar"}
                          </button>
                        ) : null}
                        {t.onTodo ? (
                          <span className="text-faint">on your To Do list</span>
                        ) : mayConnect && !todoOff ? (
                          <button
                            onClick={() => addToTodo(t)}
                            disabled={scheduling === t.id}
                            className="font-medium text-accent transition-opacity hover:opacity-70 disabled:opacity-50"
                          >
                            add to To Do
                          </button>
                        ) : null}
                        {/* One line per row, not one per missing button: both
                            walls open on the same tier, and saying it twice on
                            every task would drown the tasks. */}
                        {!mayDraft || !mayConnect ? <UpgradeNote reason={!mayDraft ? "draft" : "connect"} /> : null}
                      </div>

                      <Link href={`/meetings/${t.meetingId}`} className="mt-2 block truncate text-xs text-faint transition-colors hover:text-fg">
                        from {t.meetingTitle}
                      </Link>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {schedule.length > 0 ? (
        <aside className="order-first lg:order-last">
          <p className="rule-label">Due</p>
          <ol className="mt-3 flex flex-col">
            {schedule.map((d, i) => {
              const first = i === 0 || schedule[i - 1].label !== d.label;
              return (
                <li key={d.id}>
                  {first ? (
                    <p
                      className={`mt-3 flex items-baseline gap-2 text-xs font-medium first:mt-0 ${
                        d.overdue ? "text-danger" : "text-muted"
                      }`}
                    >
                      {d.label}
                      {d.overdue ? <span className="text-[0.6875rem] font-normal">overdue</span> : null}
                    </p>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => jumpTo(d.id)}
                    className="due-link"
                    aria-label={`Go to ${d.task.title}`}
                  >
                    <span
                      aria-hidden
                      className="due-mark"
                      style={{
                        background:
                          d.task.priority === "high"
                            ? "var(--work)"
                            : d.task.priority === "medium"
                              ? "var(--warn)"
                              : "var(--panel-border-hi)",
                      }}
                    />
                    <span className="min-w-0">
                      <span className="block truncate">{d.task.title}</span>
                      {d.task.owner ? <span className="block truncate text-xs text-faint">{d.task.owner}</span> : null}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </aside>
      ) : null}
      </div>
    </section>
  );
}
