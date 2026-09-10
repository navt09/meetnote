// Turning what a meeting said into a concrete calendar slot.
// Pure date arithmetic, injectable `now`, so the tests aren't time-dependent.

export type Slot = { start: Date; end: Date };

const WORK_START_HOUR = 9;
const WORK_END_HOUR = 17;

export function isWeekend(d: Date): boolean {
  const day = d.getDay();
  return day === 0 || day === 6;
}

/** Moves to the next weekday morning if the date lands on a weekend. */
export function nextWorkday(d: Date): Date {
  const out = new Date(d);
  while (isWeekend(out)) {
    out.setDate(out.getDate() + 1);
    out.setHours(WORK_START_HOUR, 0, 0, 0);
  }
  return out;
}

/**
 * Reads the loose due dates the extractor produces ("Thursday", "next sprint",
 * "before Friday") into an actual date. Returns null when there is nothing
 * concrete enough, rather than inventing a deadline.
 */
export function parseDue(due: string | null | undefined, now: Date): Date | null {
  const text = (due ?? "").trim().toLowerCase();
  if (!text) return null;
  // Something that already happened is not a deadline. Without this, "last
  // Thursday" matches the weekday branch and comes back as the coming one.
  if (/\b(last|previous|yesterday)\b/.test(text)) return null;

  const at = (base: Date, days: number) => {
    const d = new Date(base);
    d.setDate(d.getDate() + days);
    d.setHours(WORK_START_HOUR, 0, 0, 0);
    return d;
  };

  if (/\btoday\b/.test(text)) return at(now, 0);
  if (/\btomorrow\b/.test(text)) return at(now, 1);

  // Full names and the three-letter forms people actually say in meetings.
  // "Wed" and "Thurs" were being dropped, which meant a task with a real
  // deadline showed no date at all.
  const weekdays = [
    ["sunday", "sun"],
    ["monday", "mon"],
    ["tuesday", "tue", "tues"],
    ["wednesday", "wed", "weds"],
    ["thursday", "thu", "thur", "thurs"],
    ["friday", "fri"],
    ["saturday", "sat"],
  ];
  for (let i = 0; i < weekdays.length; i++) {
    if (weekdays[i].some((name) => new RegExp(`\\b${name}\\.?\\b`).test(text))) {
      // "Thursday" means the next one, and today doesn't count.
      let delta = (i - now.getDay() + 7) % 7;
      if (delta === 0) delta = 7;
      if (/\bnext\b/.test(text)) delta += 7;
      return at(now, delta);
    }
  }

  if (/\bnext week\b/.test(text)) return nextWorkday(at(now, 7));
  if (/\bend of (the )?week\b/.test(text)) {
    const delta = (5 - now.getDay() + 7) % 7 || 7; // upcoming Friday
    return at(now, delta);
  }

  const inDays = text.match(/\bin (\d{1,2}) days?\b/);
  if (inDays) return at(now, Number(inDays[1]));

  // An explicit date, but only if it actually parses and is in the future.
  const explicit = Date.parse(due!);
  if (!Number.isNaN(explicit)) {
    const d = new Date(explicit);
    if (d.getTime() > now.getTime()) return d;
  }
  return null;
}

/** A working-hours slot of the given length, nudged off weekends and out of the past. */
export function slotFor(when: Date, minutes: number, now: Date): Slot {
  const start = nextWorkday(new Date(when));

  // Never schedule in the past: fall forward to the next hour from now.
  if (start.getTime() < now.getTime()) {
    start.setTime(now.getTime());
    start.setMinutes(0, 0, 0);
    start.setHours(start.getHours() + 1);
  }
  // Keep it inside the working day.
  if (start.getHours() < WORK_START_HOUR) start.setHours(WORK_START_HOUR, 0, 0, 0);
  if (start.getHours() >= WORK_END_HOUR) {
    start.setDate(start.getDate() + 1);
    start.setHours(WORK_START_HOUR, 0, 0, 0);
  }

  const fixed = nextWorkday(start);
  const end = new Date(fixed.getTime() + minutes * 60_000);
  return { start: fixed, end };
}

export function toIso(d: Date): string {
  return d.toISOString();
}

/** "Tue 15 Sep, 9:00 AM" for showing a person what they're approving. */
export function describeSlot(slot: Slot): string {
  const date = slot.start.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
  const time = slot.start.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return `${date}, ${time}`;
}

/* ---------- naming a deadline ---------- */

/** Midnight local, so two dates in the same day compare equal. */
function startOfDay(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out;
}

/** Whole days from now's day to at's day. Negative means it has passed. */
export function daysUntil(at: Date, now: Date): number {
  return Math.round((startOfDay(at).getTime() - startOfDay(now).getTime()) / 86_400_000);
}

export function isOverdue(at: Date, now: Date): boolean {
  return daysUntil(at, now) < 0;
}

/**
 * What to call a deadline in a list: "Today", "Tomorrow", the weekday if it is
 * inside the coming week, and a plain date after that. Anything in the past is
 * dated, never called "Monday", because a Monday that has already gone reads
 * as one that is coming.
 */
export function dueLabel(at: Date, now: Date): string {
  const days = daysUntil(at, now);
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days > 1 && days < 7) return at.toLocaleDateString(undefined, { weekday: "long" });
  return at.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}
