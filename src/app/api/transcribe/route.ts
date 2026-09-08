import { NextResponse } from "next/server";
import type { TranscriptSegment } from "@/lib/schema";

export const runtime = "nodejs";
export const maxDuration = 300;

type DeepgramUtterance = {
  speaker?: number;
  transcript: string;
  start: number;
  end: number;
};

export async function POST(req: Request) {
  const key = process.env.DEEPGRAM_API_KEY;
  if (!key) {
    return NextResponse.json({ error: "DEEPGRAM_API_KEY is not set" }, { status: 500 });
  }

  const form = await req.formData();
  const file = form.get("audio");
  if (!(file instanceof Blob) || file.size === 0) {
    return NextResponse.json({ error: "No audio uploaded" }, { status: 400 });
  }

  const params = new URLSearchParams({
    model: "nova-3",
    smart_format: "true",
    punctuate: "true",
    diarize: "true",
    utterances: "true",
  });

  const res = await fetch(`https://api.deepgram.com/v1/listen?${params}`, {
    method: "POST",
    headers: {
      Authorization: `Token ${key}`,
      "Content-Type": file.type || "audio/webm",
    },
    body: Buffer.from(await file.arrayBuffer()),
  });

  if (!res.ok) {
    const text = await res.text();
    return NextResponse.json({ error: `Deepgram error ${res.status}: ${text}` }, { status: 502 });
  }

  const data = (await res.json()) as {
    results?: { utterances?: DeepgramUtterance[] };
  };

  const segments: TranscriptSegment[] = (data.results?.utterances ?? [])
    .filter((u) => u.transcript.trim().length > 0)
    .map((u) => ({
      speaker: `Speaker ${u.speaker ?? 0}`,
      text: u.transcript.trim(),
      start: u.start,
      end: u.end,
    }));

  return NextResponse.json({ segments });
}
