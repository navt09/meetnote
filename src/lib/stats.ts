// Plain arithmetic over meetings and tasks for the dashboard. No AI, no vendor
// calls. Every function takes `now` so the tests are not time-dependent.

export type WeekBucket = { start: Date; end: Date; label: string };

/** Monday 00:00 local time for the week containing `d`. */
export function startOfWeek(d: Date): Date {
  const out = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = (out.getDay() + 6) % 7; // Monday = 0
  out.setDate(out.getDate() - day);
  return out;
}

export function addDays(d: Date, days: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + days);
  return out;
}

/** The last `count` weeks, oldest first, ending with the week containing `now`. */
export function weekBuckets(count: number, now: Date): WeekBucket[] {
  const thisWeek = startOfWeek(now);
  return Array.from({ length: count }, (_, i) => {
    const start = addDays(thisWeek, -7 * (count - 1 - i));
    return {
      start,
      end: addDays(start, 7),
      label: start.toLocaleDateString(undefined, { day: "numeric", month: "short" }),
    };
  });
}

function inBucket(date: Date, b: WeekBucket): boolean {
  return date >= b.start && date < b.end;
}

/** How many of `items` fall into each bucket, by the date `dateOf` returns. */
export function countByWeek<T>(items: T[], dateOf: (item: T) => string | null | undefined, buckets: WeekBucket[]): number[] {
  const counts = new Array(buckets.length).fill(0);
  for (const item of items) {
    const raw = dateOf(item);
    if (!raw) continue;
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) continue;
    const i = buckets.findIndex((b) => inBucket(d, b));
    if (i >= 0) counts[i]++;
  }
  return counts;
}

/** Sums a numeric field per week, e.g. seconds of audio. */
export function sumByWeek<T>(
  items: T[],
  dateOf: (item: T) => string | null | undefined,
  valueOf: (item: T) => number,
  buckets: WeekBucket[],
): number[] {
  const totals = new Array(buckets.length).fill(0);
  for (const item of items) {
    const raw = dateOf(item);
    if (!raw) continue;
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) continue;
    const i = buckets.findIndex((b) => inBucket(d, b));
    if (i >= 0) totals[i] += Number(valueOf(item)) || 0;
  }
  return totals;
}

export type Delta = { change: number; percent: number | null; direction: "up" | "down" | "flat" };

/** This period against the one before it. percent is null when the previous period was zero. */
export function delta(current: number, previous: number): Delta {
  const change = current - previous;
  const direction = change > 0 ? "up" : change < 0 ? "down" : "flat";
  const percent = previous === 0 ? null : Math.round((change / previous) * 100);
  return { change, percent, direction };
}

/** "+2 vs last week", "-1 vs last week", "same as last week". */
export function deltaLabel(d: Delta, noun = ""): string {
  if (d.direction === "flat") return "same as last week";
  const sign = d.change > 0 ? "+" : "";
  const unit = noun ? ` ${noun}` : "";
  return `${sign}${d.change}${unit} vs last week`;
}

/** Compact whole numbers: 940, 1.2K, 13K. */
export function compact(n: number): string {
  if (Math.abs(n) < 1000) return String(Math.round(n));
  if (Math.abs(n) < 1_000_000) {
    const k = n / 1000;
    return `${k >= 10 ? Math.round(k) : k.toFixed(1)}K`;
  }
  const m = n / 1_000_000;
  return `${m >= 10 ? Math.round(m) : m.toFixed(1)}M`;
}

/** Seconds as "1h 20m" or "45m" or "30s". Reads better than a timestamp in a stat tile. */
export function humanDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s}s`;
  const minutes = Math.round(s / 60);
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/**
 * Axis maximum that always leaves headroom, so the tallest bar never touches
 * the top of the plot (which reads as clipped).
 */
export function axisMax(values: number[]): number {
  const peak = Math.max(0, ...values);
  if (peak <= 4) return peak + 1;
  if (peak <= 10) return Math.floor(peak / 2) * 2 + 2;
  return Math.floor(peak / 5) * 5 + 5;
}
