import { NextResponse } from "next/server";
import { RECORDINGS_BUCKET, supabaseAdmin } from "@/lib/supabase-admin";
import { normalizeUtterances, type DeepgramUtterance } from "@/lib/transcript";
import { transcriptionCostUsd } from "@/lib/cost";
import { HttpError, withRetry } from "@/lib/retry";

export const runtime = "nodejs";
export const maxDuration = 300;

// Only accept the paths we generate: "2026-09/<uuid>.<ext>"
const PATH_RE = /^\d{4}-\d{2}\/[0-9a-f-]{36}\.(webm|ogg|m4a|mp3|wav)$/;

/**
 * Transcribes a recording that is already in storage. We give Deepgram a
 * short-lived link instead of the bytes, so nothing large moves through here.
 */
export async function POST(req: Request) {
  const key = process.env.DEEPGRAM_API_KEY;
  if (!key) return NextResponse.json({ error: "DEEPGRAM_API_KEY is not set" }, { status: 500 });

  let body: { path?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const path = body.path ?? "";
  if (!PATH_RE.test(path)) return NextResponse.json({ error: "Invalid recording path" }, { status: 400 });

  // 1. Short-lived download link for Deepgram (valid 1 hour)
  let audioUrl: string;
  try {
    const sb = supabaseAdmin();
    const { data, error } = await sb.storage.from(RECORDINGS_BUCKET).createSignedUrl(path, 3600);
    if (error || !data) {
      return NextResponse.json({ error: `Recording not found: ${error?.message ?? path}` }, { status: 404 });
    }
    audioUrl = data.signedUrl;
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Storage error" }, { status: 500 });
  }

  // 2. Deepgram, with retries on transient failures
  const params = new URLSearchParams({
    model: "nova-3",
    smart_format: "true",
    punctuate: "true",
    diarize: "true",
    utterances: "true",
  });

  type DeepgramResponse = {
    metadata?: { duration?: number };
    results?: { utterances?: DeepgramUtterance[] };
  };

  let data: DeepgramResponse;
  try {
    data = await withRetry(
      async () => {
        const res = await fetch(`https://api.deepgram.com/v1/listen?${params}`, {
          method: "POST",
          headers: { Authorization: `Token ${key}`, "Content-Type": "application/json" },
          body: JSON.stringify({ url: audioUrl }),
          signal: AbortSignal.timeout(270_000),
        });
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          throw new HttpError(res.status, `Deepgram ${res.status}: ${text.slice(0, 300)}`);
        }
        return (await res.json()) as DeepgramResponse;
      },
      { attempts: 3, baseMs: 1500 },
    );
  } catch (err) {
    const status = err instanceof HttpError ? err.status : 0;
    const message = err instanceof Error ? err.message : "Transcription failed";
    // 4xx from Deepgram is our problem (bad key, bad audio); 5xx/timeout is theirs
    return NextResponse.json({ error: message }, { status: status >= 400 && status < 500 ? 400 : 502 });
  }

  const segments = normalizeUtterances(data.results?.utterances ?? []);
  const durationSeconds = data.metadata?.duration ?? 0;
  const costUsd = transcriptionCostUsd(durationSeconds);

  console.log(JSON.stringify({ event: "transcribe", path, durationSeconds, segments: segments.length, costUsd }));

  return NextResponse.json({ segments, durationSeconds, costUsd });
}
