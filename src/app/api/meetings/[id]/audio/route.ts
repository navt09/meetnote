import { NextResponse } from "next/server";
import { getAuth } from "@/lib/supabase/server";
import { RECORDINGS_BUCKET, supabaseAdmin } from "@/lib/supabase-admin";
import { pathBelongsTo } from "@/lib/paths";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Redirects to a 10-minute download link for the meeting's audio. */
export async function GET(req: Request, ctx: Ctx) {
  const auth = await getAuth(req);
  if (!auth) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const { data, error } = await auth.db.from("meetings").select("storage_path").eq("id", id).maybeSingle();
  if (error) {
    console.error(JSON.stringify({ event: "audio_lookup_error", id, message: error.message }));
    return NextResponse.json({ error: "Could not load this meeting." }, { status: 500 });
  }
  const path = (data as { storage_path: string | null } | null)?.storage_path;
  if (!path || !pathBelongsTo(path, auth.user.id)) return NextResponse.json({ error: "No audio for this meeting" }, { status: 404 });

  const admin = supabaseAdmin();
  const ext = path.slice(path.lastIndexOf(".") + 1);
  const { data: signed, error: signError } = await admin.storage
    .from(RECORDINGS_BUCKET)
    .createSignedUrl(path, 600, { download: `meeting-${id.slice(0, 8)}.${ext}` });
  if (signError || !signed) {
    // Vendor detail stays in the log; the browser gets a plain sentence.
    console.error(JSON.stringify({ event: "audio_sign_error", id, message: signError?.message ?? "no url" }));
    return NextResponse.json({ error: "We couldn't reach the stored audio. Try again in a minute." }, { status: 502 });
  }
  return NextResponse.redirect(signed.signedUrl, { status: 302 });
}
