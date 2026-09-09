"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { patchJson, postJson } from "@/lib/upload";
import { useToast } from "@/components/toast";
import { EmptyState } from "@/components/ui";
import { filterTasks, kindLabel, ownersOf, sortTasks, type PublicTask, type TaskFilter } from "@/lib/task";

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

      <ul className="stagger flex flex-col gap-3">
        {visible.map((t) => {
          const done = t.status === "done";
          return (
            <li key={t.id} className={`glass glass-hover flex items-start gap-3 p-4 ${done ? "opacity-55" : ""}`}>
              <button
                onClick={() => toggle(t)}
                aria-label={done ? `Mark "${t.title}" as not done` : `Mark "${t.title}" as done`}
                className={`mt-0.5 grid h-4 w-4 flex-none place-items-center rounded border text-[0.6rem] transition-colors ${
                  done ? "border-accent bg-accent text-[color:var(--accent-ink)]" : "border-panel-border hover:border-accent"
                }`}
              >
                {done ? "✓" : ""}
              </button>

              <div className="min-w-0 flex-1">
                <p className={`text-sm font-medium leading-snug ${done ? "line-through decoration-faint" : ""}`}>{t.title}</p>
                {t.details ? <p className="mt-1 text-sm leading-relaxed text-muted">{t.details}</p> : null}
                <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-faint">
                  <span>{t.owner ?? "unassigned"}</span>
                  <span>{kindLabel(t.kind)}</span>
                  {t.due ? <span className="text-warn">due {t.due}</span> : null}
                  <Link href={`/meetings/${t.meetingId}`} className="truncate transition-colors hover:text-fg">
                    {t.meetingTitle}
                  </Link>
                  {hasDraft.has(t.id) ? (
                    <Link href="/approvals" className="text-accent transition-colors hover:underline">ticket drafted</Link>
                  ) : (
                    <button
                      onClick={() => draft(t)}
                      disabled={drafting === t.id}
                      className="text-muted transition-colors hover:text-fg disabled:opacity-50"
                    >
                      {drafting === t.id ? "drafting…" : "draft ticket"}
                    </button>
                  )}
                  {t.calendarEventUrl ? (
                    <a href={t.calendarEventUrl} target="_blank" rel="noreferrer" className="text-accent transition-colors hover:underline">
                      on your calendar
                    </a>
                  ) : (
                    <button
                      onClick={() => addToCalendar(t)}
                      disabled={scheduling === t.id}
                      className="text-muted transition-colors hover:text-fg disabled:opacity-50"
                    >
                      {scheduling === t.id ? "adding…" : "add to calendar"}
                    </button>
                  )}
                </p>
              </div>

              {t.priority === "high" && !done ? <span className="pill pill-danger flex-none">high</span> : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
