import { NextResponse } from "next/server";
import { isBlocked, requireDrafting } from "@/lib/guard";
import { draftTicket } from "@/lib/agent";
import { toPublicDraft, type DraftRow } from "@/lib/draft";
import { publicErrorMessage } from "@/lib/public-error";
import type { Meeting } from "@/lib/meeting";
import type { TaskRow } from "@/lib/task";

export const runtime = "nodejs";
export const maxDuration = 120;

type Ctx = { params: Promise<{ id: string }> };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Draft a ticket for one task. Replaces any existing draft for that task. */
export async function POST(req: Request, ctx: Ctx) {
  const gate = await requireDrafting(req);
  if (isBlocked(gate)) return gate;
  const { auth } = gate;
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: "Drafting isn't configured." }, { status: 500 });

  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const { data: taskData, error: taskError } = await auth.db.from("tasks").select("*").eq("id", id).maybeSingle();
  if (taskError) {
    console.error(JSON.stringify({ event: "draft_task_lookup_error", id, message: taskError.message }));
    return NextResponse.json({ error: "Could not load that task." }, { status: 500 });
  }
  if (!taskData) return NextResponse.json({ error: "Task not found" }, { status: 404 });
  const task = taskData as TaskRow;

  const { data: meetingData, error: meetingError } = await auth.db
    .from("meetings")
    .select("id,title,notes,transcript")
    .eq("id", task.meeting_id)
    .maybeSingle();
  if (meetingError || !meetingData) return NextResponse.json({ error: "Could not load the meeting." }, { status: 500 });
  const meeting = meetingData as Pick<Meeting, "id" | "title" | "notes" | "transcript">;

  let result;
  try {
    result = await draftTicket(task, meeting.notes, meeting.transcript, meeting.title);
  } catch (err) {
    console.error(JSON.stringify({ event: "draft_error", id, raw: err instanceof Error ? err.message : String(err) }));
    return NextResponse.json({ error: publicErrorMessage(err) }, { status: 502 });
  }

  // One live draft per task: upsert on the unique index.
  const { data, error } = await auth.db
    .from("drafts")
    .upsert(
      {
        user_id: auth.user.id,
        meeting_id: meeting.id,
        task_id: task.id,
        kind: "ticket",
        subject: result.draft.subject,
        body: result.draft.body,
        status: "pending",
        approved_at: null,
        model: result.model,
        usage: result.usage,
        cost_usd: result.costUsd,
      },
      { onConflict: "task_id" },
    )
    .select("*, meetings(title)")
    .maybeSingle();

  if (error || !data) {
    console.error(JSON.stringify({ event: "draft_save_error", id, message: error?.message }));
    return NextResponse.json({ error: "Drafted it, but couldn't save it. Try again." }, { status: 500 });
  }

  const row = data as DraftRow & { meetings: { title: string } | null };
  return NextResponse.json({ draft: toPublicDraft(row, row.meetings?.title ?? meeting.title) }, { status: 201 });
}
