import { NextResponse } from "next/server";
import { getAuth } from "@/lib/supabase/server";
import { deliverDraft, DeliveryError } from "@/lib/deliver";
import { toPublicDraft, type DraftRow, type DraftStatus } from "@/lib/draft";

export const runtime = "nodejs";
export const maxDuration = 60;

type Ctx = { params: Promise<{ id: string }> };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const STATUSES: DraftStatus[] = ["pending", "approved", "dismissed"];

const withMeeting = "*, meetings(title)";
type Joined = DraftRow & { meetings: { title: string } | null };

/**
 * Approve, dismiss, or edit the wording. Approving is the only thing that can
 * send anything anywhere, and it only sends if a connector is set up.
 */
export async function PATCH(req: Request, ctx: Ctx) {
  const auth = await getAuth(req);
  if (!auth) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  let body: { status?: string; subject?: string; body?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  if (body.status !== undefined) {
    if (!STATUSES.includes(body.status as DraftStatus)) return NextResponse.json({ error: "Unknown status" }, { status: 400 });
    patch.status = body.status;
    patch.approved_at = body.status === "approved" ? new Date().toISOString() : null;
  }
  if (body.subject !== undefined) {
    const subject = body.subject.trim().slice(0, 300);
    if (!subject) return NextResponse.json({ error: "The subject can't be empty" }, { status: 400 });
    patch.subject = subject;
  }
  if (body.body !== undefined) {
    const text = body.body.trim().slice(0, 20000);
    if (!text) return NextResponse.json({ error: "The body can't be empty" }, { status: 400 });
    patch.body = text;
  }
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: "Nothing to change" }, { status: 400 });

  const { data, error } = await auth.db.from("drafts").update(patch).eq("id", id).select(withMeeting).maybeSingle();
  if (error) {
    console.error(JSON.stringify({ event: "draft_update_error", id, message: error.message }));
    return NextResponse.json({ error: "Could not update that draft." }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: "Draft not found" }, { status: 404 });
  let row = data as Joined;

  // Only an approval, and only once: a draft that already went somewhere is
  // never sent twice.
  if (patch.status === "approved" && !row.external_url) {
    try {
      const result = await deliverDraft(auth.user.id, row);
      if (result.delivered) {
        const { data: updated } = await auth.db
          .from("drafts")
          .update({ destination: result.destination, external_url: result.url })
          .eq("id", id)
          .select(withMeeting)
          .maybeSingle();
        if (updated) row = updated as Joined;
        console.log(JSON.stringify({ event: "draft_delivered", id, destination: result.destination }));
      }
    } catch (err) {
      // The approval stands; only the send failed. Say so plainly and let them retry.
      const message = err instanceof DeliveryError ? err.message : "Couldn't send that just now.";
      const needsReconnect = err instanceof DeliveryError && err.needsReconnect;
      console.error(JSON.stringify({ event: "draft_deliver_error", id, message }));
      return NextResponse.json(
        {
          draft: toPublicDraft(row, row.meetings?.title ?? "Untitled meeting"),
          warning: message,
          needsReconnect,
        },
        { status: 200 },
      );
    }
  }

  return NextResponse.json({ draft: toPublicDraft(row, row.meetings?.title ?? "Untitled meeting") });
}

export async function DELETE(req: Request, ctx: Ctx) {
  const auth = await getAuth(req);
  if (!auth) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const { error } = await auth.db.from("drafts").delete().eq("id", id);
  if (error) {
    console.error(JSON.stringify({ event: "draft_delete_error", id, message: error.message }));
    return NextResponse.json({ error: "Could not delete that draft." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
