import { supabaseServer } from "@/lib/supabase/server";
import { sortTasks, toPublicTask, type TaskRow } from "@/lib/task";
import { dueLabel, isOverdue, parseDue } from "@/lib/schedule";
import TasksView from "./tasks-view";

export const dynamic = "force-dynamic";
export const metadata = { title: "Tasks · From the Call" };

type Joined = TaskRow & { meetings: { title: string } | null };

export default async function TasksPage() {
  const db = await supabaseServer();

  const [tasksRes, draftsRes] = await Promise.all([
    db.from("tasks").select("*, meetings(title)").order("created_at", { ascending: false }).limit(500),
    db.from("drafts").select("task_id").not("task_id", "is", null).limit(500),
  ]);

  const tasks = sortTasks(((tasksRes.data ?? []) as Joined[]).map((r) => toPublicTask(r, r.meetings?.title ?? "Untitled meeting")));
  const drafted = ((draftsRes.data ?? []) as { task_id: string | null }[]).map((d) => d.task_id).filter((id): id is string => !!id);

  // Deadlines are worked out here rather than in the browser: "Thursday" only
  // means something relative to a clock, and the server's is the one the rest
  // of the page was rendered against. Sorted soonest first, overdue at the
  // top, and only what is still to do.
  const now = new Date();
  const due = tasks
    .filter((t) => t.status === "open")
    .flatMap((t) => {
      // The moment resolved when the task was written. Tasks created before
      // that column existed still have only the words, so they are parsed
      // here as a fallback.
      const stored = t.dueAt ? new Date(t.dueAt) : null;
      const at = stored && !Number.isNaN(stored.getTime()) ? stored : parseDue(t.due, now);
      return at ? [{ id: t.id, at, label: dueLabel(at, now), overdue: isOverdue(at, now) }] : [];
    })
    .sort((a, b) => a.at.getTime() - b.at.getTime())
    .map(({ id, label, overdue }) => ({ id, label, overdue }));

  return (
    <TasksView
      initial={tasks}
      drafted={drafted}
      due={due}
      loadError={tasksRes.error ? "Could not load your tasks. Refresh to try again." : null}
    />
  );
}
