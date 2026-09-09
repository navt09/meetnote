import { describe, expect, it } from "vitest";
import { addDays, axisMax, compact, countByWeek, delta, deltaLabel, humanDuration, startOfWeek, sumByWeek, weekBuckets } from "../stats";

// Tuesday 8 September 2026, local time.
const NOW = new Date(2026, 8, 8, 14, 30);

describe("startOfWeek", () => {
  it("returns the Monday at midnight", () => {
    const s = startOfWeek(NOW);
    expect(s.getDay()).toBe(1);
    expect(s.getDate()).toBe(7);
    expect([s.getHours(), s.getMinutes(), s.getSeconds()]).toEqual([0, 0, 0]);
  });
  it("treats Sunday as the end of the week, not the start", () => {
    const sunday = new Date(2026, 8, 13, 23, 0);
    expect(startOfWeek(sunday).getDate()).toBe(7);
  });
  it("is stable when already Monday midnight", () => {
    const monday = new Date(2026, 8, 7, 0, 0);
    expect(startOfWeek(monday).getTime()).toBe(monday.getTime());
  });
});

describe("weekBuckets", () => {
  it("returns n weeks oldest first, ending with this week", () => {
    const b = weekBuckets(4, NOW);
    expect(b).toHaveLength(4);
    expect(b[3].start.getDate()).toBe(7);
    expect(b[0].start.getDate()).toBe(17); // 3 weeks earlier, August
    expect(b[0].start.getMonth()).toBe(7);
  });
  it("makes each bucket exactly seven days", () => {
    for (const b of weekBuckets(3, NOW)) {
      expect(b.end.getTime() - b.start.getTime()).toBe(7 * 24 * 3600 * 1000);
    }
  });
});

describe("countByWeek", () => {
  const buckets = weekBuckets(3, NOW);
  it("counts items into the right week", () => {
    const items = [
      { at: NOW.toISOString() },
      { at: addDays(NOW, -1).toISOString() },
      { at: addDays(NOW, -8).toISOString() },
      { at: addDays(NOW, -60).toISOString() }, // outside the window
    ];
    expect(countByWeek(items, (i) => i.at, buckets)).toEqual([0, 1, 2]);
  });
  it("ignores missing and unparseable dates", () => {
    const items = [{ at: null }, { at: undefined }, { at: "not a date" }];
    expect(countByWeek(items, (i) => i.at as string | null, buckets)).toEqual([0, 0, 0]);
  });
  it("handles an empty list", () => {
    expect(countByWeek([], () => null, buckets)).toEqual([0, 0, 0]);
  });
});

describe("sumByWeek", () => {
  it("adds up a numeric field per week", () => {
    const buckets = weekBuckets(2, NOW);
    const items = [
      { at: NOW.toISOString(), secs: 100 },
      { at: addDays(NOW, -1).toISOString(), secs: 50 },
      { at: addDays(NOW, -8).toISOString(), secs: 20 },
    ];
    expect(sumByWeek(items, (i) => i.at, (i) => i.secs, buckets)).toEqual([20, 150]);
  });
  it("treats non-numeric values as zero", () => {
    const buckets = weekBuckets(1, NOW);
    expect(sumByWeek([{ at: NOW.toISOString(), secs: NaN }], (i) => i.at, (i) => i.secs, buckets)).toEqual([0]);
  });
});

describe("delta", () => {
  it("reports direction and percent", () => {
    expect(delta(6, 4)).toEqual({ change: 2, percent: 50, direction: "up" });
    expect(delta(3, 6)).toEqual({ change: -3, percent: -50, direction: "down" });
    expect(delta(5, 5)).toEqual({ change: 0, percent: 0, direction: "flat" });
  });
  it("returns a null percent when there is nothing to compare against", () => {
    expect(delta(4, 0)).toEqual({ change: 4, percent: null, direction: "up" });
  });
});

describe("deltaLabel", () => {
  it("reads as a sentence", () => {
    expect(deltaLabel(delta(6, 4))).toBe("+2 vs last week");
    expect(deltaLabel(delta(3, 6))).toBe("-3 vs last week");
    expect(deltaLabel(delta(5, 5))).toBe("same as last week");
    expect(deltaLabel(delta(2, 1), "meetings")).toBe("+1 meetings vs last week");
  });
});

describe("compact", () => {
  it("shortens large numbers", () => {
    expect(compact(0)).toBe("0");
    expect(compact(940)).toBe("940");
    expect(compact(1200)).toBe("1.2K");
    expect(compact(13000)).toBe("13K");
    expect(compact(2_400_000)).toBe("2.4M");
  });
});

describe("humanDuration", () => {
  it("reads naturally at each scale", () => {
    expect(humanDuration(30)).toBe("30s");
    expect(humanDuration(2700)).toBe("45m");
    expect(humanDuration(3600)).toBe("1h");
    expect(humanDuration(4800)).toBe("1h 20m");
    expect(humanDuration(0)).toBe("0s");
    expect(humanDuration(-5)).toBe("0s");
  });
});

describe("axisMax", () => {
  it("always leaves headroom, so the tallest bar never touches the top", () => {
    for (const values of [[0], [1], [3, 1], [4], [5, 7], [10], [11, 3], [42]]) {
      expect(axisMax(values)).toBeGreaterThan(Math.max(...values));
    }
  });
  it("picks readable round numbers", () => {
    expect(axisMax([0, 0, 0])).toBe(1);
    expect(axisMax([1, 0])).toBe(2);
    expect(axisMax([5, 7])).toBe(8);
    expect(axisMax([10])).toBe(12);
    expect(axisMax([11, 3])).toBe(15);
  });
});
