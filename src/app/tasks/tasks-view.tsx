"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { patchJson, postJson } from "@/lib/upload";
import { useToast } from "@/components/toast";
import { EmptyState } from "@/components/ui";
import { filterTasks, kindLabel, ownersOf, sortTasks, type PublicTask, type TaskFilter } from "@/lib/task";
import { PriorityFlag } from "@/components/priority";

const FILTERS: { key: TaskFilter; label: string }[] = [
  { key: "open", label: "To do" },
  { key: "done", label: "Done" },
  { key: "all", label: "All" },
];

export default function TasksView({ initial, loadError, drafted }: { initial: PublicTask[]; loadError: string | null; drafted: string[] }) {
  const toast = useToast();
  const router = useRouter();
  const [tasks, setTasks] = useState<PublicTask[]>(initial);
  const [filter, setFilter] = useState<TaskFilter>("open");
  const [owner, setOwner] = useState<string | null>(null);
  const [hasDraft, setHasDraft] = useState<Set<string>>(new Set(drafted));
  const [drafting, setDrafting] = useState<string | null>(null);
  const [scheduling, setScheduling] = useState<string | null>(null);
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

  const owners = useMemo(() => ownersOf(tasks), [tasks]);
  const visible = useMemo(() => sortTasks(filterTasks(tasks, filter, owner)), [tasks, filter, owner]);
  const openCount = useMemo(() => tasks.filter((t) => t.status === "open").length, [tasks]);

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
      <div className="rise flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Tasks</h1>
          <p className="mt-1 text-sm text-muted">
            {openCount === 0 ? "Nothing outstanding" : `${openCount} still to do`}
            {tasks.length > openCount ? ` · ${tasks.length - openCount} done` : ""}
          </p>
        </div>
        <Link href="/record" className="btn btn-primary">New meeting</Link>
      </div>

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
                <li key={t.id} className="band-row">
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
                        {t.due ? <span className="font-medium text-warn">due {t.due}</span> : null}
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
    </section>
  );
}
