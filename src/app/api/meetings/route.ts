import { NextResponse } from "next/server";
import { parseSelfSpeech } from "@/lib/self-speech";
import { isBlocked, requirePaid } from "@/lib/guard";
import { getAuth } from "@/lib/supabase/server";
import { MAX_UPLOAD_BYTES, mintUploadUrl } from "@/lib/storage";
import { baseMime, buildStoragePath, extForMime } from "@/lib/paths";
import { isOwnerEmail } from "@/lib/admin";
import { defaultTitle, toPublicSummary, type Meeting } from "@/lib/meeting";

export const runtime = "nodejs";

/** List the caller's meetings, newest first. */
export async function GET(req: Request) {
  const auth = await getAuth(req);
  if (!auth) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const { data, error } = await auth.db
    .from("meetings")
    .select("id,title,status,error,duration_seconds,recorded_at,transcription_cost_usd,llm_cost_usd")
    .order("recorded_at", { ascending: false })
    .limit(200);
  if (error) {
    console.error(JSON.stringify({ event: "meetings_list_error", message: error.message }));
    return NextResponse.json({ error: "Could not load your meetings." }, { status: 500 });
  }
  const owner = isOwnerEmail(auth.user.email);
  const rows = (data ?? []) as Array<Parameters<typeof toPublicSummary>[0]>;
  return NextResponse.json({ meetings: rows.map((r) => toPublicSummary(r, owner)) });
}

/**
 * Create a meeting row and hand back a one-time upload URL for its audio.
 * The browser uploads straight to storage; nothing large passes through here.
 */
export async function POST(req: Request) {
  const gate = await requirePaid(req);
  if (isBlocked(gate)) return gate;
  const { auth } = gate;

  let body: { mimeType?: string; bytes?: number; durationSeconds?: number; recordedAt?: string; selfSpeech?: unknown; sources?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const mime = baseMime(body.mimeType);
  if (!extForMime(mime)) return NextResponse.json({ error: "That audio format isn't supported." }, { status: 400 });
  const bytes = Number(body.bytes);
  if (!Number.isFinite(bytes) || bytes <= 0) return NextResponse.json({ error: "Missing file size" }, { status: 400 });
  if (bytes > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: `That recording is ${(bytes / 1048576).toFixed(0)} MB. The limit is ${MAX_UPLOAD_BYTES / 1048576} MB.` }, { status: 413 });
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
    // Malformed windows are dropped, never rejected: a bad timeline should
    // cost the "for you" notes, not the recording.
    self_speech: parseSelfSpeech(body.selfSpeech, duration),
    // Coerced rather than trusted: it is a diagnostic, so a malformed value
    // should record "we don't know" instead of failing the recording.
    sources:
      body.sources && typeof body.sources === "object"
        ? {
            system: (body.sources as { system?: unknown }).system === true,
            mic: (body.sources as { mic?: unknown }).mic === true,
          }
        : null,
  } satisfies Partial<Meeting>);
  if (insertError) {
    console.error(JSON.stringify({ event: "meeting_create_error", message: insertError.message }));
    return NextResponse.json({ error: "Could not save this meeting. Try again." }, { status: 500 });
  }

  const ticket = await mintUploadUrl(storagePath);
  if ("error" in ticket) {
    console.error(JSON.stringify({ event: "upload_url_error", message: ticket.error }));
    return NextResponse.json({ error: "Couldn't prepare the upload. Try again in a minute." }, { status: 502 });
  }

  // storagePath is deliberately not returned; the browser only needs the URL.
  return NextResponse.json({ meetingId: id, signedUrl: ticket.signedUrl, contentType: mime }, { status: 201 });
}
