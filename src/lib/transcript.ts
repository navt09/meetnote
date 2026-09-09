import type { TranscriptSegment } from "./schema";

export type DeepgramUtterance = {
  speaker?: number;
  transcript: string;
  start: number;
  end: number;
};

/**
 * Turn Deepgram's utterances into clean segments.
 * - drops empty ones
 * - merges consecutive utterances from the same speaker when the pause between
 *   them is short, so "Also," and "we decided to..." become one line
 */
export function normalizeUtterances(
  utts: DeepgramUtterance[],
  mergeGapSeconds = 1.0,
  maxMergedSeconds = 20,
): TranscriptSegment[] {
  const out: TranscriptSegment[] = [];
  for (const u of utts) {
    const text = (u.transcript ?? "").trim();
    if (!text) continue;
    const speaker = `Speaker ${u.speaker ?? 0}`;
    const prev = out[out.length - 1];
    // Merging is capped, not unbounded. When diarisation puts everyone under
    // one label - which it does when the voices genuinely are one person, or
    // when it simply fails - unbounded merging swallows a whole meeting into a
    // single segment, and nothing downstream that works per segment can then
    // attribute any part of it to anyone.
    const wouldRunLong = prev ? u.end - prev.start > maxMergedSeconds : false;
    if (prev && !wouldRunLong && prev.speaker === speaker && u.start - prev.end <= mergeGapSeconds) {
      prev.text = `${prev.text} ${text}`;
      prev.end = u.end;
    } else {
      out.push({ speaker, text, start: u.start, end: u.end });
    }
  }
  return out;
}

export function formatTimestamp(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = m.toString().padStart(2, "0");
  const ss = sec.toString().padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
}

/** Rough word count, used to warn before sending a huge transcript. */
export function wordCount(segments: TranscriptSegment[]): number {
  return segments.reduce((n, s) => n + s.text.split(/\s+/).filter(Boolean).length, 0);
}
