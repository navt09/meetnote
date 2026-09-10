"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { patchJson, postJson } from "@/lib/upload";
import { useToast } from "@/components/toast";
import { EmptyState, PageHead } from "@/components/ui";
import { filterTasks, kindLabel, ownersOf, sortTasks, type PublicTask, type TaskFilter } from "@/lib/task";
import { PriorityFlag } from "@/components/priority";

const FILTERS: { key: TaskFilter; label: string }[] = [
  { key: "open", label: "To do" },
  { key: "done", label: "Done" },
  { key: "all", label: "All" },
];

/** One deadline, dated on the server where "Thursday" has a fixed meaning. */
export type DueEntry = { id: string; label: string; overdue: boolean };

export default function TasksView({
  initial,
  loadError,
  drafted,
  due,
}: {
  initial: PublicTask[];
  loadError: string | null;
  drafted: string[];
  due: DueEntry[];
}) {
  const toast = useToast();
  const router = useRouter();
  const [tasks, setTasks] = useState<PublicTask[]>(initial);
  const [filter, setFilter] = useState<TaskFilter>("open");
  const [owner, setOwner] = useState<string | null>(null);
  const [hasDraft, setHasDraft] = useState<Set<string>>(new Set(drafted));
  const [drafting, setDrafting] = useState<string | null>(null);
  const [scheduling, setScheduling] = useState<string | null>(null);
  // The row to jump to. Carries a counter so picking the same deadline twice
  // in a row still moves and flashes.
  const [target, setTarget] = useState<{ id: string; n: number } | null>(null);
  const error = loadError;

  /** Blocks time out on the user's own calendar. Nobody else is invited or emailed. */
  async function addToCalendar(task: PublicTask) {
    setScheduling(task.id);
    try {
      const res = await postJson<{ url: string; when: string }>(`/api/tasks/${task.id}/calendar`, {});
      setTasks((list) => list.map((t) => (t.id === task.id ? { ...t, calendarEventUrl: res.url } : t)));
      toast(`Blocked out ${res.when}`, "ok");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not add that to your calendar", "error");
    } finally {
      setScheduling(null);
    }
  }

  async function draft(task: PublicTask) {
    setDrafting(task.id);
    try {
      await postJson(`/api/tasks/${task.id}/draft`, {});
      setHasDraft((s) => new Set(s).add(task.id));
      toast("Ticket drafted. Check it in Approvals.", "ok");
      router.refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not draft that ticket", "error");
    } finally {
      setDrafting(null);
    }
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

  const owners = useMemo(() => ownersOf(tasks), [tasks]);
  const visible = useMemo(() => sortTasks(filterTasks(tasks, filter, owner)), [tasks, filter, owner]);
  const openCount = useMemo(() => tasks.filter((t) => t.status === "open").length, [tasks]);

  // Scrolling happens in an effect, after the row it is looking for has been
  // rendered by the filter change that may have just been made.
  useEffect(() => {
    if (!target) return;
    document.getElementById(`task-${target.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    const id = setTimeout(() => setTarget(null), 1800);
    return () => clearTimeout(id);
  }, [target]);

  function jumpTo(id: string) {
    // A deadline is no use if pressing it lands on a filter that hides the row.
    if (!visible.some((t) => t.id === id)) {
      setFilter("all");
      setOwner(null);
    }
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

          {owners.length > 1 ? (
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => setOwner(null)}
                className={`pill transition-colors ${owner === null ? "pill-live" : "hover:text-fg"}`}
              >
                Everyone
              </button>
              {owners.map((o) => (
                <button key={o} onClick={() => setOwner(o === owner ? null : o)} className={`pill transition-colors ${owner === o ? "pill-live" : "hover:text-fg"}`}>
                  {o}
                </button>
              ))}
            </div>
          ) : null}
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
          body={filter === "open" ? "Every task from your meetings is done." : "Try a different filter."}
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
                        <p className={`font-medium leading-snug ${done ? "text-faint line-through" : ""}`}>{t.title}</p>
                        <PriorityFlag priority={t.priority} done={done} />
                      </div>
                      {t.details ? <p className="mt-1 text-sm leading-relaxed text-muted">{t.details}</p> : null}

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
                        {hasDraft.has(t.id) ? (
                          <Link href="/approvals" className="font-medium text-accent transition-opacity hover:opacity-70">ticket drafted</Link>
                        ) : (
                          <button
                            onClick={() => draft(t)}
                            disabled={drafting === t.id}
                            className="font-medium text-accent transition-opacity hover:opacity-70 disabled:opacity-50"
                          >
                            {drafting === t.id ? "drafting…" : "draft ticket"}
                          </button>
                        )}
                        {t.calendarEventUrl ? (
                          <a href={t.calendarEventUrl} target="_blank" rel="noreferrer" className="font-medium text-accent transition-opacity hover:opacity-70">
                            on your calendar
                          </a>
                        ) : (
                          <button
                            onClick={() => addToCalendar(t)}
                            disabled={scheduling === t.id}
                            className="font-medium text-accent transition-opacity hover:opacity-70 disabled:opacity-50"
                          >
                            {scheduling === t.id ? "adding…" : "add to calendar"}
                          </button>
                        )}
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
