import { supabaseServer } from "@/lib/supabase/server";
import { sortTasks, toPublicTask, type TaskRow } from "@/lib/task";
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

  return <TasksView initial={tasks} drafted={drafted} loadError={tasksRes.error ? "Could not load your tasks. Refresh to try again." : null} />;
}
