import { NextResponse } from "next/server";
import { getAuth } from "@/lib/supabase/server";
import { MAX_UPLOAD_BYTES, mintUploadUrl } from "@/lib/storage";
import { baseMime, buildStoragePath, extForMime } from "@/lib/paths";
import { defaultTitle, type MeetingSummary } from "@/lib/meeting";

export const runtime = "nodejs";

/** List the caller's meetings, newest first (summary columns only). */
export async function GET(req: Request) {
  const auth = await getAuth(req);
  if (!auth) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const { data, error } = await auth.db
    .from("meetings")
    .select("id,title,status,error,duration_seconds,recorded_at,transcription_cost_usd,llm_cost_usd")
    .order("recorded_at", { ascending: false })
    .limit(200);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ meetings: (data ?? []) as MeetingSummary[] });
}

/**
 * Create a meeting row and hand back a one-time upload URL for its audio.
 * The browser uploads straight to storage; nothing large passes through here.
 */
export async function POST(req: Request) {
  const auth = await getAuth(req);
  if (!auth) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  let body: { mimeType?: string; bytes?: number; durationSeconds?: number; recordedAt?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const mime = baseMime(body.mimeType);
  if (!extForMime(mime)) return NextResponse.json({ error: `Unsupported audio type: ${body.mimeType ?? "unknown"}` }, { status: 400 });
  const bytes = Number(body.bytes);
  if (!Number.isFinite(bytes) || bytes <= 0) return NextResponse.json({ error: "Missing file size" }, { status: 400 });
  if (bytes > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: `Recording is ${(bytes / 1048576).toFixed(0)} MB; the limit is ${MAX_UPLOAD_BYTES / 1048576} MB.` }, { status: 413 });
  }
  const recordedAt = body.recordedAt && !Number.isNaN(Date.parse(body.recordedAt)) ? new Date(body.recordedAt) : new Date();
  const duration = Number(body.durationSeconds);

  const id = crypto.randomUUID();
  const storagePath = buildStoragePath(auth.user.id, id, mime);

  const { error: insertError } = await auth.db.from("meetings").insert({
    id,
    user_id: auth.user.id,
    title: defaultTitle(recordedAt),
    status: "recorded",
    storage_path: storagePath,
    mime_type: mime,
    bytes,
    duration_seconds: Number.isFinite(duration) && duration > 0 ? duration : null,
    recorded_at: recordedAt.toISOString(),
  });
  if (insertError) return NextResponse.json({ error: `Could not save meeting: ${insertError.message}` }, { status: 500 });

  const ticket = await mintUploadUrl(storagePath);
  if ("error" in ticket) return NextResponse.json({ error: ticket.error }, { status: 502 });

  return NextResponse.json({ meetingId: id, storagePath, signedUrl: ticket.signedUrl, contentType: mime }, { status: 201 });
}
