import { NextResponse } from "next/server";
import { getAuth } from "@/lib/supabase/server";
import { RECORDINGS_BUCKET, supabaseAdmin } from "@/lib/supabase-admin";
import { pathBelongsTo } from "@/lib/paths";
import type { Meeting } from "@/lib/meeting";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export async function GET(req: Request, ctx: Ctx) {
  const auth = await getAuth(req);
  if (!auth) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const { data, error } = await auth.db.from("meetings").select("*").eq("id", id).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
  return NextResponse.json({ meeting: data as Meeting });
}

/** Rename. Only the title is editable by hand; everything else is produced by the pipeline. */
export async function PATCH(req: Request, ctx: Ctx) {
  const auth = await getAuth(req);
  if (!auth) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  let body: { title?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const title = (body.title ?? "").trim().slice(0, 200);
  if (!title) return NextResponse.json({ error: "Title can't be empty" }, { status: 400 });

  const { data, error } = await auth.db.from("meetings").update({ title }).eq("id", id).select("id,title").maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
  return NextResponse.json({ meeting: data });
}

/** Deletes the audio from storage first, then the row. */
export async function DELETE(req: Request, ctx: Ctx) {
  const auth = await getAuth(req);
  if (!auth) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const { data: row, error } = await auth.db.from("meetings").select("id,storage_path").eq("id", id).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!row) return NextResponse.json({ error: "Meeting not found" }, { status: 404 });

  const path = (row as { storage_path: string | null }).storage_path;
  if (path && pathBelongsTo(path, auth.user.id)) {
    const admin = supabaseAdmin();
    const { error: rmError } = await admin.storage.from(RECORDINGS_BUCKET).remove([path]);
    // A missing object is fine; anything else should stop us so audio isn't orphaned.
    if (rmError && !/not found/i.test(rmError.message)) {
      return NextResponse.json({ error: `Could not delete audio: ${rmError.message}` }, { status: 502 });
    }
  }

  const { error: delError } = await auth.db.from("meetings").delete().eq("id", id);
  if (delError) return NextResponse.json({ error: delError.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
