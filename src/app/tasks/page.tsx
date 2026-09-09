import { supabaseServer } from "@/lib/supabase/server";
import { sortTasks, toPublicTask, type TaskRow } from "@/lib/task";
import TasksView from "./tasks-view";

export const dynamic = "force-dynamic";
export const metadata = { title: "Tasks · Meetnote" };

type Joined = TaskRow & { meetings: { title: string } | null };

export default async function TasksPage() {
  const db = await supabaseServer();
  const { data, error } = await db
    .from("tasks")
    .select("*, meetings(title)")
    .order("created_at", { ascending: false })
    .limit(500);

  const tasks = sortTasks(((data ?? []) as Joined[]).map((r) => toPublicTask(r, r.meetings?.title ?? "Untitled meeting")));
  return <TasksView initial={tasks} loadError={error ? "Could not load your tasks. Refresh to try again." : null} />;
}
