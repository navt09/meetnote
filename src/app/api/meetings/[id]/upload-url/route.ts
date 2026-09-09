import { NextResponse } from "next/server";
import { getAuth } from "@/lib/supabase/server";
import { mintUploadUrl } from "@/lib/storage";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Fresh upload URL for an existing meeting, used when a previous upload attempt failed. */
export async function POST(req: Request, ctx: Ctx) {
  const auth = await getAuth(req);
  if (!auth) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const { data, error } = await auth.db.from("meetings").select("storage_path,mime_type,status").eq("id", id).maybeSingle();
  if (error) {
    console.error(JSON.stringify({ event: "upload_url_lookup_error", id, message: error.message }));
    return NextResponse.json({ error: "Couldn't prepare the upload." }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
  const row = data as { storage_path: string | null; mime_type: string | null; status: string };
  if (!row.storage_path) return NextResponse.json({ error: "This meeting has no audio slot." }, { status: 409 });
  if (row.status !== "recorded" && row.status !== "error") {
    return NextResponse.json({ error: "This meeting already has its audio." }, { status: 409 });
  }

  const ticket = await mintUploadUrl(row.storage_path);
  if ("error" in ticket) {
    console.error(JSON.stringify({ event: "upload_url_error", id, message: ticket.error }));
    return NextResponse.json({ error: "Couldn't prepare the upload. Try again in a minute." }, { status: 502 });
  }
  return NextResponse.json({ signedUrl: ticket.signedUrl, contentType: row.mime_type ?? "audio/webm" });
}
