// Facts pulled out of a transcript by plain code, with no model involved.
//
// Each of these has one right answer that a word search can find: a
// competitor was named or it was not, an amount of money was said or it was
// not. Asking a model for them would cost tokens and add a way to be wrong
// that a search does not have — it could name a competitor nobody mentioned.
// Every result carries the line it came from, so a person can check it.
//
// Computed when a meeting is read rather than stored, for two reasons. The
// competitor list is edited after meetings happen, and a name added today
// should be found in last month's calls. And none of it moves with the clock:
// the next-meeting date is resolved against when the meeting was *recorded*,
// never against now, so it reads the same on every visit.
//
// Pure and time-injectable, unit-tested in __tests__/signals.test.ts.

import { parseDue } from "./schedule";
import type { TranscriptSegment } from "./schema";

/** One place in the transcript where something was found. */
export type Mention = {
  /** The words that matched, as they appear in the transcript. */
  text: string;
  /** Seconds from the start of the recording, for the timestamp beside it. */
  start: number;
  speaker: string;
  /** The matched words with a little of the line either side. */
  excerpt: string;
};

export type CompetitorHit = { name: string; mentions: Mention[] };

export type NextMeeting = {
  /**
   * The calendar day it resolves to, as YYYY-MM-DD, with no time and no zone.
   * A timestamp would be pinned to a time of day on the server's clock and
   * then shifted into the reader's, and far enough west of the server that
   * lands on the day before. A meeting is on a day, not at an instant.
   */
  date: string;
  start: number;
  speaker: string;
  excerpt: string;
};

export type Signals = {
  competitors: CompetitorHit[];
  money: Mention[];
  nextMeeting: NextMeeting | null;
  /** How many names this account tracks, so the page can say when it tracks none. */
  competitorsTracked: number;
};

/* ---------- the competitor list ---------- */

/** Enough for any real market; a list longer than this is a keyword dump. */
export const COMPETITORS_MAX = 30;
export const COMPETITOR_NAME_MAX = 40;

/**
 * Trims, bounds and de-duplicates a list of names. Accepts an array or a
 * comma/newline separated string, because that is how people paste them.
 * Case-insensitive duplicates keep the first spelling given.
 */
export function cleanCompetitors(input: unknown): string[] {
  const raw = Array.isArray(input) ? input : typeof input === "string" ? input.split(/[,\n]/) : [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const name = item.replace(/\s+/g, " ").trim().slice(0, COMPETITOR_NAME_MAX);
    // A single character matches half the transcript and finds nothing useful.
    if (name.length < 2) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name);
    if (out.length >= COMPETITORS_MAX) break;
  }
  return out;
}

/* ---------- helpers ---------- */

/** Most mentions of one thing worth listing; past this it is the subject of the call. */
const MAX_MENTIONS = 12;
const EXCERPT_RADIUS = 70;

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** The matched words with up to EXCERPT_RADIUS characters either side, cut at a word. */
export function excerpt(text: string, index: number, length: number, radius = EXCERPT_RADIUS): string {
  let from = Math.max(0, index - radius);
  let to = Math.min(text.length, index + length + radius);
  if (from > 0) {
    const space = text.indexOf(" ", from);
    if (space !== -1 && space < index) from = space + 1;
  }
  if (to < text.length) {
    const space = text.lastIndexOf(" ", to);
    if (space > index + length) to = space;
  }
  return `${from > 0 ? "…" : ""}${text.slice(from, to).trim()}${to < text.length ? "…" : ""}`;
}

/* ---------- competitors ---------- */

/**
 * Every line naming a tracked competitor, as a whole word and ignoring case.
 *
 * Whole word, or "Gong" is found inside "ongoing" and "Close" inside every
 * "closer". Lookarounds on letters and digits rather than \b, because \b is
 * ASCII-only and a name can start or end with anything.
 */
export function findCompetitors(segments: TranscriptSegment[], names: string[]): CompetitorHit[] {
  const hits: CompetitorHit[] = [];
  for (const name of names) {
    const re = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(name)}(?![\\p{L}\\p{N}])`, "giu");
    const mentions: Mention[] = [];
    for (const s of segments) {
      for (const m of s.text.matchAll(re)) {
        if (mentions.length >= MAX_MENTIONS) break;
        mentions.push({ text: m[0], start: s.start, speaker: s.speaker, excerpt: excerpt(s.text, m.index, m[0].length) });
      }
    }
    if (mentions.length > 0) hits.push({ name, mentions });
  }
  // Most talked-about first: that is the one the deal is being weighed against.
  return hits.sort((a, b) => b.mentions.length - a.mentions.length);
}

/* ---------- money ---------- */

const SCALE = String.raw`(?:k|m|mm|bn|b|thousand|million|billion|grand)`;
const NUMBER = String.raw`\d[\d,]*(?:\.\d+)?`;
const CURRENCY_WORD = String.raw`(?:dollars?|bucks|pounds?|quid|euros?|usd|gbp|eur)`;
/** What the amount is per. Only ever read after an amount, never alone. */
const PER = String.raw`(?:\s?(?:per|a|an|each|/)\s?(?:seat|user|licen[cs]e|head|month|year|annum|quarter)|\s(?:annually|monthly|yearly))`;

/**
 * Amounts of money and pricing phrases.
 *
 * An amount needs a currency: a symbol in front ("$40k") or a word after it
 * ("40 thousand dollars"). A bare number is not money — "4k video", "20
 * minutes", "version 2.5" — and treating it as money would bury the real
 * figures in noise. The transcription service writes spoken amounts as
 * figures with a symbol, so the symbol form is the one most calls produce.
 */
const MONEY_RE = new RegExp(
  [
    String.raw`[$£€]\s?${NUMBER}(?:\s?${SCALE}\b)?${PER}?`,
    String.raw`\b${NUMBER}\s?(?:${SCALE}\s)?${CURRENCY_WORD}\b${PER}?`,
    String.raw`\b${NUMBER}\s?grand\b${PER}?`,
    // A pricing unit said without a figure is still a pricing conversation.
    String.raw`\bper[- ](?:seat|user|licen[cs]e)\b`,
  ].join("|"),
  "gi",
);

export function findMoney(segments: TranscriptSegment[]): Mention[] {
  const out: Mention[] = [];
  for (const s of segments) {
    for (const m of s.text.matchAll(MONEY_RE)) {
      if (out.length >= MAX_MENTIONS * 2) return out;
      const text = m[0].trim();
      out.push({ text, start: s.start, speaker: s.speaker, excerpt: excerpt(s.text, m.index, m[0].length) });
    }
  }
  return out;
}

/* ---------- the next meeting ---------- */

/** Words that say a sentence is about meeting again, rather than about any date at all. */
const MEET_AGAIN = new RegExp(
  [
    String.raw`\bmeet(?:ing)? (?:again|up)\b`,
    String.raw`\bnext (?:meeting|call|session|sync|check-?in)\b`,
    String.raw`\bcatch[- ]up\b`,
    String.raw`\breconvene\b`,
    String.raw`\bregroup\b`,
    String.raw`\btouch base\b`,
    String.raw`\breconnect\b`,
    String.raw`\bfollow[- ]up (?:call|meeting)\b`,
    String.raw`\bpick (?:this|it|that) (?:back )?up\b`,
    String.raw`\b(?:let's|let us|we'll|we will|shall we|can we) (?:meet|talk|speak|chat|sync|hop on)\b`,
  ].join("|"),
  "i",
);

const WEEKDAYS = "monday|tuesday|wednesday|thursday|friday|saturday|sunday";
const MONTHS = "january|february|march|april|may|june|july|august|september|october|november|december";

/**
 * The time words in a sentence, and only those.
 *
 * parseDue was written for short phrases like "Thursday", and it accepts the
 * three-letter day forms. Handed a whole sentence, "we sat down" or "the sun"
 * would read as a weekday, so the phrase is cut out first and only full day
 * names are looked for.
 */
const WHEN_RE = new RegExp(
  [
    String.raw`\b(?:next |this )?(?:${WEEKDAYS})\b`,
    String.raw`\btomorrow\b`,
    String.raw`\bnext week\b`,
    String.raw`\bend of (?:the )?week\b`,
    String.raw`\bin \d{1,2} days?\b`,
  ].join("|"),
  "i",
);
const MONTH_DAY_RE = new RegExp(String.raw`\b(${MONTHS}) (\d{1,2})(?:st|nd|rd|th)?\b`, "i");

/** A month and day said without a year, placed in the first year that puts it after `at`. */
function monthDay(sentence: string, at: Date): Date | null {
  const m = sentence.match(MONTH_DAY_RE);
  if (!m) return null;
  const month = MONTHS.split("|").indexOf(m[1].toLowerCase());
  const day = Number(m[2]);
  if (day < 1 || day > 31) return null;
  const d = new Date(at);
  d.setMonth(month, day);
  d.setHours(9, 0, 0, 0);
  // "September 31" rolls into October; that is not a date anybody said.
  if (d.getMonth() !== month) return null;
  if (d.getTime() <= at.getTime()) d.setFullYear(d.getFullYear() + 1);
  return d;
}

/**
 * When the meeting said it would meet again, resolved against when it was
 * recorded.
 *
 * The last such sentence wins: plans are proposed, argued about and settled,
 * and the settled one comes at the end. A sentence about the past ("last
 * Tuesday we met") is skipped, for the same reason parseDue refuses it.
 */
export function findNextMeeting(segments: TranscriptSegment[], recordedAt: Date): NextMeeting | null {
  let found: NextMeeting | null = null;
  for (const s of segments) {
    let offset = 0;
    for (const sentence of s.text.split(/(?<=[.!?])\s+/)) {
      const index = s.text.indexOf(sentence, offset);
      offset = index + sentence.length;
      if (!MEET_AGAIN.test(sentence)) continue;
      if (/\b(last|previous|yesterday|ago)\b/i.test(sentence)) continue;

      const phrase = sentence.match(WHEN_RE)?.[0];
      const date = (phrase ? parseDue(phrase, recordedAt) : null) ?? monthDay(sentence, recordedAt);
      if (!date) continue;

      found = {
        date: calendarDay(date),
        start: s.start,
        speaker: s.speaker,
        excerpt: excerpt(s.text, Math.max(0, index), sentence.length, 30),
      };
    }
  }
  return found;
}

/** The date's own day, month and year, as YYYY-MM-DD. */
function calendarDay(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/* ---------- all of it ---------- */

export function findSignals(segments: TranscriptSegment[], competitors: string[], recordedAt: Date): Signals {
  return {
    competitors: findCompetitors(segments, competitors),
    money: findMoney(segments),
    nextMeeting: findNextMeeting(segments, recordedAt),
    competitorsTracked: competitors.length,
  };
}
