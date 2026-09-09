import { NextResponse } from "next/server";
import { RECORDINGS_BUCKET, supabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";

// Supabase free tier caps a single upload at 50 MB. At our 32 kbps recording
// bitrate that is roughly 3.5 hours of audio.
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

const MIME_TO_EXT: Record<string, string> = {
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/mp4": "m4a",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
};

/**
 * Hands the browser a one-time URL it can upload straight to storage with.
 * The audio never passes through our server, which is what keeps us under
 * Vercel's 4.5 MB request limit.
 */
export async function POST(req: Request) {
  let body: { mimeType?: string; bytes?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const baseMime = (body.mimeType ?? "").split(";")[0].trim().toLowerCase();
  const ext = MIME_TO_EXT[baseMime];
  if (!ext) {
    return NextResponse.json({ error: `Unsupported audio type: ${body.mimeType ?? "unknown"}` }, { status: 400 });
  }
  const bytes = Number(body.bytes);
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return NextResponse.json({ error: "Missing file size" }, { status: 400 });
  }
  if (bytes > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      { error: `Recording is ${(bytes / 1048576).toFixed(0)} MB; the limit is ${MAX_UPLOAD_BYTES / 1048576} MB.` },
      { status: 413 },
    );
  }

  const now = new Date();
  const folder = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const path = `${folder}/${crypto.randomUUID()}.${ext}`;

  try {
    const sb = supabaseAdmin();
    const { data, error } = await sb.storage.from(RECORDINGS_BUCKET).createSignedUploadUrl(path);
    if (error || !data) {
      return NextResponse.json({ error: `Could not create upload URL: ${error?.message ?? "unknown"}` }, { status: 502 });
    }
    return NextResponse.json({ path: data.path, signedUrl: data.signedUrl, token: data.token, contentType: baseMime });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Storage error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
