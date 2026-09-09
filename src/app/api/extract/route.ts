import { NextResponse } from "next/server";
import { extractNotes } from "@/lib/extract";
import { wordCount } from "@/lib/transcript";
import type { TranscriptSegment } from "@/lib/schema";

export const runtime = "nodejs";
export const maxDuration = 300;

// ~4 hours of dense talking. Beyond this, one pass is unreliable.
const MAX_WORDS = 60_000;

export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY is not set" }, { status: 500 });
  }

  let body: { segments?: TranscriptSegment[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const segments = (body.segments ?? []).filter(
    (s) => s && typeof s.text === "string" && s.text.trim().length > 0 && typeof s.speaker === "string",
  );
  if (segments.length === 0) {
    return NextResponse.json({ error: "No transcript segments provided" }, { status: 400 });
  }
  const words = wordCount(segments);
  if (words > MAX_WORDS) {
    return NextResponse.json({ error: `Transcript has ${words} words; the limit is ${MAX_WORDS}.` }, { status: 413 });
  }

  try {
    const { notes, usage, costUsd, model } = await extractNotes(segments);
    return NextResponse.json({ notes, usage, costUsd, model });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Extraction failed";
    console.error(JSON.stringify({ event: "extract_error", message }));
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
