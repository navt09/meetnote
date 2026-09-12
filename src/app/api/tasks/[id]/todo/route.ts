import { NextResponse } from "next/server";
import { isBlocked, requireConnections } from "@/lib/guard";
import { loadConnector, noteConnectorError } from "@/lib/connector-store";
import { createTodo } from "@/lib/providers/outlook";
import { MicrosoftReconnectError } from "@/lib/providers/microsoft";
import { parseDue } from "@/lib/schedule";
import type { MicrosoftConfig, MicrosoftCredentials } from "@/lib/connectors";
import type { TaskRow } from "@/lib/task";

export const runtime = "nodejs";
export const maxDuration = 60;

type Ctx = { params: Promise<{ id: string }> };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * Puts one task on the person's Microsoft To Do list.
 *
 * Deliberately not a draft. A follow-up is drafted because somebody else will
 * read it and it has to be written for them; a task on your own list is the
 * words already agreed in the meeting, so sending it through a model and an
 * approval queue would cost eight seconds and a request to arrive at the text
 * that was already there.
 *
 * The deadline comes from `due_at`, resolved once when the task was written.
 * Re-parsing `due` here would walk the date forward on every press, which is
 * the bug the whole `due`/`due_at` split exists to prevent.
 */
export async function POST(req: Request, ctx: Ctx) {
  const gate = await requireConnections(req);
  if (isBlocked(gate)) return gate;
  const { auth } = gate;
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const { data, error } = await auth.db.from("tasks").select("*").eq("id", id).maybeSingle();
  if (error) {
    console.error(JSON.stringify({ event: "task_todo_lookup_error", id, message: error.message }));
    return NextResponse.json({ error: "Could not load that task." }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: "Task not found" }, { status: 404 });
  const task = data as TaskRow;

  // A list somebody works from, so a second press must not leave two copies.
  if (task.todo_task_id) {
    return NextResponse.json({ error: "That task is already on your To Do list." }, { status: 409 });
  }

  const stored = await loadConnector<MicrosoftCredentials, MicrosoftConfig>(auth.user.id, "microsoft");
  if (!stored) return NextResponse.json({ error: "Connect Microsoft in Settings first." }, { status: 400 });
  if (!(stored.config.scopes ?? []).includes("Tasks.ReadWrite")) {
    return NextResponse.json(
      { error: "That Microsoft connection cannot reach your tasks. Reconnect Microsoft in Settings." },
      { status: 400 },
    );
  }

  // Resolved once, at extraction. Rows written before that column existed fall
  // back to parsing, exactly as /tasks does.
  const stored_due = task.due_at ? new Date(task.due_at) : null;
  const dueAt = stored_due && !Number.isNaN(stored_due.getTime()) ? stored_due : parseDue(task.due, new Date());

  const body = [task.details, task.blocked_by ? `Waiting on: ${task.blocked_by}` : "", "From the Call"]
    .filter(Boolean)
    .join("\n\n");

  try {
    const created = await createTodo(auth.user.id, stored.credentials, stored.config, {
      title: task.title,
      body,
      dueAt: dueAt ? dueAt.toISOString() : null,
    });
    await noteConnectorError(auth.user.id, "microsoft", null);
    await auth.db
      .from("tasks")
      .update({ todo_task_id: created.id, todo_added_at: new Date().toISOString() })
      .eq("id", id);

    console.log(JSON.stringify({ event: "task_todo_added", id }));
    return NextResponse.json({ ok: true, title: created.title }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Couldn't add that to your To Do list.";
    await noteConnectorError(auth.user.id, "microsoft", message);
    console.error(JSON.stringify({ event: "task_todo_error", id, message }));
    return NextResponse.json({ error: message, needsReconnect: err instanceof MicrosoftReconnectError }, { status: 502 });
  }
}
