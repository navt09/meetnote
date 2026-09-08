import { NextResponse } from "next/server";
import { extractNotes } from "@/lib/extract";
import type { TranscriptSegment } from "@/lib/schema";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY is not set" }, { status: 500 });
  }
  const body = (await req.json()) as { segments?: TranscriptSegment[] };
  if (!body.segments?.length) {
    return NextResponse.json({ error: "No transcript segments provided" }, { status: 400 });
  }
  try {
    const notes = await extractNotes(body.segments);
    return NextResponse.json({ notes });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Extraction failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
