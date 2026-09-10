import type { TranscriptSegment } from "./schema";

/**
 * The lines either side of a task's quote.
 *
 * A quote on its own says a task was not invented, but it rarely says why the
 * task exists. The reason is almost always in the sentence before it or the
 * answer after it, and both are already sitting in the transcript, so this
 * costs nothing beyond finding where the quote sits.
 *
 * Found by matching text, not by asking the model a second time: the quote is
 * stored verbatim precisely so it can be matched. Failing to find it is a
 * normal outcome, and the honest answer to that is null rather than a guess.
 */

export type QuoteLine = { speaker: string; text: string };
export type QuoteContext = { before: QuoteLine | null; after: QuoteLine | null };

/**
 * How much of a neighbouring line is worth showing. Long enough for a real
 * sentence, short enough that a monologue does not bury the quote it is meant
 * to be framing.
 */
export const NEIGHBOUR_MAX = 180;

/**
 * Too short to place. "Yes." appears in half the segments of any meeting, so a
 * match on it would point at whichever one happened to come first.
 */
const MIN_MATCHABLE = 12;

/**
 * Compared on the words alone. Transcripts arrive with smart quotes and the
 * model's copy often has straight ones, and a difference of punctuation is not
 * a difference of what was said.
 */
function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[“”„‟]/g, '"')
    .replace(/[^\p{L}\p{N}\s']/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Keeps the end of a line, which is the half nearest the quote. */
function tailOf(text: string): string {
  const t = text.trim();
  if (t.length <= NEIGHBOUR_MAX) return t;
  return `…${t.slice(t.length - NEIGHBOUR_MAX).replace(/^\S*\s/, "")}`;
}

/** Keeps the start of a line, for the same reason in the other direction. */
function headOf(text: string): string {
  const t = text.trim();
  if (t.length <= NEIGHBOUR_MAX) return t;
  return `${t.slice(0, NEIGHBOUR_MAX).replace(/\s\S*$/, "")}…`;
}

function lineAt(segments: TranscriptSegment[], i: number, keep: (t: string) => string): QuoteLine | null {
  const seg = segments[i];
  if (!seg || !seg.text?.trim()) return null;
  return { speaker: seg.speaker, text: keep(seg.text) };
}

/**
 * Where the quote sits in the transcript, as `[first, last]` segment indexes,
 * or null when it cannot be placed.
 *
 * Two ways a quote lines up with segments, and both happen. Usually the quote
 * is part of one segment, so that segment contains it. Sometimes it spans a
 * couple of segments, in which case the quote contains each of them instead,
 * and the run of them is the span.
 */
export function locateQuote(quote: string, segments: TranscriptSegment[]): [number, number] | null {
  const needle = normalise(quote ?? "");
  if (needle.length < MIN_MATCHABLE || segments.length === 0) return null;

  const texts = segments.map((s) => normalise(s.text ?? ""));

  // One segment holds the whole quote. The commonest case by far.
  const inside = texts.findIndex((t) => t.length >= MIN_MATCHABLE && t.includes(needle));
  if (inside !== -1) return [inside, inside];

  // The quote runs across segments: find the longest unbroken run of segments
  // the quote contains. A run rather than any single match, because a filler
  // line elsewhere in the meeting can also be contained in a long quote.
  let best: [number, number] | null = null;
  let start = -1;
  for (let i = 0; i <= texts.length; i++) {
    const held = i < texts.length && texts[i].length >= MIN_MATCHABLE && needle.includes(texts[i]);
    if (held) {
      if (start === -1) start = i;
      continue;
    }
    if (start !== -1) {
      const run: [number, number] = [start, i - 1];
      if (!best || run[1] - run[0] > best[1] - best[0]) best = run;
      start = -1;
    }
  }
  return best;
}

/**
 * The line before and the line after, or null when the quote cannot be placed
 * or sits alone at one end of the meeting with nothing on either side.
 */
export function quoteContext(quote: string | null | undefined, segments: TranscriptSegment[]): QuoteContext | null {
  if (!quote?.trim()) return null;
  const span = locateQuote(quote, segments);
  if (!span) return null;

  const before = lineAt(segments, span[0] - 1, tailOf);
  const after = lineAt(segments, span[1] + 1, headOf);
  if (!before && !after) return null;
  return { before, after };
}
