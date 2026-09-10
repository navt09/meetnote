import { NextResponse } from "next/server";
import { isBlocked, requireDrafting } from "@/lib/guard";
import { cleanDraftNote, draftEmail } from "@/lib/agent";
import { toPublicDraft, type DraftRow } from "@/lib/draft";
import { publicErrorMessage } from "@/lib/public-error";
import type { Meeting } from "@/lib/meeting";
import { getDisplayName } from "@/lib/settings-store";

export const runtime = "nodejs";
export const maxDuration = 120;

type Ctx = { params: Promise<{ id: string }> };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Draft a follow-up email to one of the people the meeting flagged. */
export async function POST(req: Request, ctx: Ctx) {
  const gate = await requireDrafting(req);
  if (isBlocked(gate)) return gate;
  const { auth } = gate;
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: "Drafting isn't configured." }, { status: 500 });

  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  let body: { name?: string; note?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const name = (body.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "Which person?" }, { status: 400 });
  const note = cleanDraftNote(body.note);

  const { data: meetingData, error: meetingError } = await auth.db
    .from("meetings")
    .select("id,title,notes,transcript")
    .eq("id", id)
    .maybeSingle();
  if (meetingError) {
    console.error(JSON.stringify({ event: "draft_email_lookup_error", id, message: meetingError.message }));
    return NextResponse.json({ error: "Could not load that meeting." }, { status: 500 });
  }
  if (!meetingData) return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
  const meeting = meetingData as Pick<Meeting, "id" | "title" | "notes" | "transcript">;

  // Only somebody the notes actually named; no free-text targets.
  const person = meeting.notes?.people_to_contact?.find((p) => p.name.toLowerCase() === name.toLowerCase());
  if (!person) return NextResponse.json({ error: "That person isn't in this meeting's notes." }, { status: 400 });

  let result;
  try {
    const senderName = await getDisplayName(auth.user.id);
    result = await draftEmail(person, meeting.notes, meeting.transcript, meeting.title, senderName, note);
  } catch (err) {
    console.error(JSON.stringify({ event: "draft_email_error", id, raw: err instanceof Error ? err.message : String(err) }));
    return NextResponse.json({ error: publicErrorMessage(err) }, { status: 502 });
  }

  const { data, error } = await auth.db
    .from("drafts")
    .insert({
      user_id: auth.user.id,
      meeting_id: meeting.id,
      task_id: null,
      kind: "email",
      subject: result.draft.subject,
      body: result.draft.body,
      recipient: person.name,
      status: "pending",
      model: result.model,
      usage: result.usage,
      cost_usd: result.costUsd,
    })
    .select("*, meetings(title)")
    .maybeSingle();

  if (error || !data) {
    console.error(JSON.stringify({ event: "draft_email_save_error", id, message: error?.message }));
    return NextResponse.json({ error: "Drafted it, but couldn't save it. Try again." }, { status: 500 });
  }

  const row = data as DraftRow & { meetings: { title: string } | null };
  return NextResponse.json({ draft: toPublicDraft(row, row.meetings?.title ?? meeting.title) }, { status: 201 });
}
