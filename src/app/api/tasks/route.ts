import { NextResponse } from "next/server";
import { getAuth } from "@/lib/supabase/server";
import { sortTasks, toPublicTask, type TaskRow } from "@/lib/task";

export const runtime = "nodejs";

/** Every task across the caller's meetings, newest and highest priority first. */
export async function GET(req: Request) {
  const auth = await getAuth(req);
  if (!auth) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const { data, error } = await auth.db
    .from("tasks")
    .select("*, meetings(title)")
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) {
    console.error(JSON.stringify({ event: "tasks_list_error", message: error.message }));
    return NextResponse.json({ error: "Could not load your tasks." }, { status: 500 });
  }

  type Joined = TaskRow & { meetings: { title: string } | null };
  const tasks = ((data ?? []) as Joined[]).map((r) => toPublicTask(r, r.meetings?.title ?? "Untitled meeting"));
  return NextResponse.json({ tasks: sortTasks(tasks) });
}
