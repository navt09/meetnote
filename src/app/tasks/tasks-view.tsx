"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { patchJson } from "@/lib/upload";
import { useToast } from "@/components/toast";
import { EmptyState } from "@/components/ui";
import { filterTasks, KIND_ICON, kindLabel, ownersOf, sortTasks, type PublicTask, type TaskFilter } from "@/lib/task";

const FILTERS: { key: TaskFilter; label: string }[] = [
  { key: "open", label: "To do" },
  { key: "done", label: "Done" },
  { key: "all", label: "All" },
];

export default function TasksView({ initial, loadError }: { initial: PublicTask[]; loadError: string | null }) {
  const toast = useToast();
  const [tasks, setTasks] = useState<PublicTask[]>(initial);
  const [filter, setFilter] = useState<TaskFilter>("open");
  const [owner, setOwner] = useState<string | null>(null);
  const error = loadError;

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
        <Link href="/record" className="btn btn-primary">New recording</Link>
      </div>

      {error ? <p className="glass p-4 text-sm text-danger">{error}</p> : null}

      {tasks.length > 0 ? (
        <div className="rise flex flex-wrap items-center gap-2">
          <div className="flex gap-1 rounded-full border border-panel-border bg-black/25 p-1">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  filter === f.key ? "bg-gradient-to-r from-accent to-accent-2 text-[#05060a]" : "text-muted hover:text-fg"
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
            <li key={t.id} className={`glass glass-hover flex items-start gap-3.5 p-4 ${done ? "opacity-60" : ""}`}>
              <button
                onClick={() => toggle(t)}
                aria-label={done ? `Mark "${t.title}" as not done` : `Mark "${t.title}" as done`}
                className={`mt-0.5 grid h-5 w-5 flex-none place-items-center rounded-md border text-[0.65rem] transition-all ${
                  done
                    ? "border-transparent bg-gradient-to-br from-accent to-accent-2 text-[#05060a]"
                    : "border-panel-border hover:border-accent hover:shadow-[0_0_0_4px_rgba(110,231,249,0.12)]"
                }`}
              >
                {done ? "✓" : ""}
              </button>

              <div className="min-w-0 flex-1">
                <p className={`font-medium leading-snug ${done ? "line-through decoration-muted" : ""}`}>
                  <span className="mr-1.5 text-accent" aria-hidden>{KIND_ICON[t.kind]}</span>
                  {t.title}
                </p>
                {t.details ? <p className="mt-1 text-sm leading-relaxed text-muted">{t.details}</p> : null}
                <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                  <span className="rounded-md bg-white/5 px-1.5 py-0.5">{t.owner ?? "unassigned"}</span>
                  <span>{kindLabel(t.kind)}</span>
                  {t.due ? <span className="text-warn">due {t.due}</span> : null}
                  <span aria-hidden>·</span>
                  <Link href={`/meetings/${t.meetingId}`} className="truncate transition-colors hover:text-accent">
                    {t.meetingTitle}
                  </Link>
                </p>
              </div>

              <span className={`pill flex-none ${t.priority === "high" && !done ? "pill-danger" : ""}`}>{t.priority}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
