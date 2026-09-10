// Comparing two extraction runs of the same transcript.
//
// The question this answers is not "which run is cheaper" but "what would I
// lose". A cheaper reasoning effort that quietly drops one action item is the
// failure nobody notices, so the diff is by item, not by count.
//
// No AI is involved here: matching is string arithmetic on purpose, because a
// model judging a model's output would be the same uncertainty twice over.

/** Only the fields the diff reads. Structurally satisfied by MeetingNotes. */
export type ComparableItem = { title: string; owner: string | null; due: string | null };
export type ComparableDecision = { decision: string };
export type ComparablePerson = { name: string };

export type ComparableNotes = {
  action_items: ComparableItem[];
  decisions: ComparableDecision[];
  people_to_contact: ComparablePerson[];
};

export type Run = { level: string; notes: ComparableNotes };

export const CATEGORIES = ["action_items", "decisions", "people_to_contact"] as const;
export type Category = (typeof CATEGORIES)[number];

/** Lowercase, drop punctuation, collapse whitespace. Diacritics are left alone: names carry them. */
export function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

// Words that carry no meaning in a ticket title, so "Fix the login bug" and
// "Fix login bug" are the same item rather than a 75% match.
const FILLER = new Set([
  "a", "an", "the", "to", "for", "of", "in", "on", "at", "by", "and", "or",
  "with", "into", "from", "up", "out", "is", "are", "be", "will", "that", "this",
]);

function tokens(s: string): string[] {
  return normalizeText(s)
    .split(" ")
    .filter((w) => w.length > 0 && !FILLER.has(w));
}

/**
 * Overlap of the smaller token set, not Jaccard: a run that says the same thing
 * with extra words ("Fix login bug on staging") should still match the shorter
 * title. Scores 0..1.
 */
export function similarity(a: string, b: string): number {
  const ta = new Set(tokens(a));
  const tb = new Set(tokens(b));
  if (ta.size === 0 || tb.size === 0) return normalizeText(a) === normalizeText(b) ? 1 : 0;
  let shared = 0;
  for (const w of ta) if (tb.has(w)) shared++;
  return shared / Math.min(ta.size, tb.size);
}

/**
 * 0.6 of the shorter title's meaningful words in common. Tuned to forgive
 * rewording ("Ship the migration" / "Ship migration script") while still
 * calling two different tickets two different tickets.
 */
export const MATCH_THRESHOLD = 0.6;

export function matchesLoosely(a: string, b: string): boolean {
  return similarity(a, b) >= MATCH_THRESHOLD;
}

/**
 * Greedy best-first pairing. Each item on either side is used at most once, so
 * two similar titles in one run cannot both claim the same partner.
 */
export function pairUp(left: string[], right: string[]): { pairs: [number, number][]; onlyLeft: number[]; onlyRight: number[] } {
  const scored: { score: number; i: number; j: number }[] = [];
  for (let i = 0; i < left.length; i++) {
    for (let j = 0; j < right.length; j++) {
      const score = similarity(left[i], right[j]);
      if (score >= MATCH_THRESHOLD) scored.push({ score, i, j });
    }
  }
  scored.sort((x, y) => y.score - x.score || x.i - y.i || x.j - y.j);

  const usedLeft = new Set<number>();
  const usedRight = new Set<number>();
  const pairs: [number, number][] = [];
  for (const s of scored) {
    if (usedLeft.has(s.i) || usedRight.has(s.j)) continue;
    usedLeft.add(s.i);
    usedRight.add(s.j);
    pairs.push([s.i, s.j]);
  }
  return {
    pairs,
    onlyLeft: left.map((_, i) => i).filter((i) => !usedLeft.has(i)),
    onlyRight: right.map((_, j) => j).filter((j) => !usedRight.has(j)),
  };
}

/** The one line that stands for an item of each category in the report. */
export function labelsOf(notes: ComparableNotes, category: Category): string[] {
  if (category === "action_items") return notes.action_items.map((x) => x.title);
  if (category === "decisions") return notes.decisions.map((x) => x.decision);
  return notes.people_to_contact.map((x) => x.name);
}

function blank(v: string | null | undefined): boolean {
  return v == null || v.trim() === "";
}

export type FieldGap = {
  /** The action item's title, as the run that filled the field wrote it. */
  title: string;
  field: "owner" | "due";
  filledIn: string;
  blankIn: string;
  value: string;
};

export type CategoryDiff = { onlyInA: string[]; onlyInB: string[] };

export type PairDiff = {
  a: string;
  b: string;
  categories: Record<Category, CategoryDiff>;
  fieldGaps: FieldGap[];
  /** True when neither run has an item or a filled field the other lacks. */
  identical: boolean;
};

export function diffRuns(a: Run, b: Run): PairDiff {
  const categories = {} as Record<Category, CategoryDiff>;
  const fieldGaps: FieldGap[] = [];

  for (const category of CATEGORIES) {
    const left = labelsOf(a.notes, category);
    const right = labelsOf(b.notes, category);
    const { pairs, onlyLeft, onlyRight } = pairUp(left, right);
    categories[category] = { onlyInA: onlyLeft.map((i) => left[i]), onlyInB: onlyRight.map((j) => right[j]) };

    // Only action items carry an owner and a due date, and only matched pairs
    // can disagree about them: an item missing outright is already reported.
    if (category !== "action_items") continue;
    for (const [i, j] of pairs) {
      const ia = a.notes.action_items[i];
      const ib = b.notes.action_items[j];
      for (const field of ["owner", "due"] as const) {
        const va = ia[field];
        const vb = ib[field];
        if (!blank(va) && blank(vb)) fieldGaps.push({ title: ia.title, field, filledIn: a.level, blankIn: b.level, value: va!.trim() });
        else if (blank(va) && !blank(vb)) fieldGaps.push({ title: ib.title, field, filledIn: b.level, blankIn: a.level, value: vb!.trim() });
      }
    }
  }

  const identical =
    fieldGaps.length === 0 && CATEGORIES.every((c) => categories[c].onlyInA.length === 0 && categories[c].onlyInB.length === 0);
  return { a: a.level, b: b.level, categories, fieldGaps, identical };
}

/**
 * The cheapest run that loses nothing against the reference (the last run,
 * which the caller must order by what each run actually cost, cheapest first,
 * so the reference is the dearest one). Ordering by the level's name would be
 * wrong: "default" has no known place on the scale, and a level that reasons
 * less can still write more.
 * "Loses nothing" is one-directional: extra items in the cheap run are not a
 * loss, a missing item or an unfilled owner is. Null when every cheaper run
 * lost something, which is the answer that says "keep paying for the dear one".
 */
export function cheapestLossless(runs: Run[]): string | null {
  if (runs.length === 0) return null;
  // With one run there is nothing it could have lost against.
  if (runs.length === 1) return runs[0].level;
  const reference = runs[runs.length - 1];
  for (const run of runs.slice(0, -1)) {
    const d = diffRuns(run, reference);
    const missing = CATEGORIES.some((c) => d.categories[c].onlyInB.length > 0);
    const dropped = d.fieldGaps.some((g) => g.blankIn === run.level);
    if (!missing && !dropped) return run.level;
  }
  return null;
}
