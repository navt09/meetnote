import { NextResponse } from "next/server";
import { getAuth } from "@/lib/supabase/server";
import { toPublicTask, type TaskRow, type TaskStatus } from "@/lib/task";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const STATUSES: TaskStatus[] = ["open", "done", "dismissed"];

/** Tick a task off, put it back, or dismiss it. Status is the only editable field. */
export async function PATCH(req: Request, ctx: Ctx) {
  const auth = await getAuth(req);
  if (!auth) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  let body: { status?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const status = body.status as TaskStatus;
  if (!STATUSES.includes(status)) return NextResponse.json({ error: "Unknown status" }, { status: 400 });

  const { data, error } = await auth.db
    .from("tasks")
    .update({ status, completed_at: status === "done" ? new Date().toISOString() : null })
    .eq("id", id)
    .select("*, meetings(title)")
    .maybeSingle();

  if (error) {
    console.error(JSON.stringify({ event: "task_update_error", id, message: error.message }));
    return NextResponse.json({ error: "Could not update that task." }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: "Task not found" }, { status: 404 });

  const row = data as TaskRow & { meetings: { title: string } | null };
  return NextResponse.json({ task: toPublicTask(row, row.meetings?.title ?? "Untitled meeting") });
}
