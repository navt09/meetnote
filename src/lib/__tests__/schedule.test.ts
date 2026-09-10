import { describe, expect, it } from "vitest";
import { describeSlot, dueLabel, isOverdue, isWeekend, nextWorkday, parseDue, slotFor } from "../schedule";

// Tuesday 8 September 2026, 14:30 local.
const NOW = new Date(2026, 8, 8, 14, 30);

describe("parseDue", () => {
  it("reads today and tomorrow", () => {
    expect(parseDue("today", NOW)?.getDate()).toBe(8);
    expect(parseDue("tomorrow", NOW)?.getDate()).toBe(9);
  });

  it("reads a weekday as the next one, never today", () => {
    // Thursday is 2 days after Tuesday.
    expect(parseDue("Thursday", NOW)?.getDate()).toBe(10);
    // Asking for Tuesday on a Tuesday means next Tuesday, not now.
    expect(parseDue("Tuesday", NOW)?.getDate()).toBe(15);
  });

  it("handles the phrasing the extractor actually produces", () => {
    expect(parseDue("by Thursday", NOW)?.getDate()).toBe(10);
    expect(parseDue("before Friday", NOW)?.getDate()).toBe(11);
    expect(parseDue("next Monday", NOW)?.getDate()).toBe(21);
  });

  it("reads relative phrases", () => {
    expect(parseDue("in 3 days", NOW)?.getDate()).toBe(11);
    expect(parseDue("end of week", NOW)?.getDate()).toBe(11);
  });

  it("sets a sensible time of day rather than midnight", () => {
    expect(parseDue("tomorrow", NOW)?.getHours()).toBe(9);
  });

  it("returns null rather than inventing a date", () => {
    for (const vague of ["", null, undefined, "next sprint", "soon", "when we get to it", "TBD"]) {
      expect(parseDue(vague, NOW)).toBeNull();
    }
  });

  it("ignores an explicit date that has already passed", () => {
    expect(parseDue("2020-01-01", NOW)).toBeNull();
    expect(parseDue("2027-01-04", NOW)?.getFullYear()).toBe(2027);
  });
});

describe("nextWorkday / isWeekend", () => {
  it("identifies weekends", () => {
    expect(isWeekend(new Date(2026, 8, 12))).toBe(true); // Saturday
    expect(isWeekend(new Date(2026, 8, 13))).toBe(true); // Sunday
    expect(isWeekend(new Date(2026, 8, 14))).toBe(false); // Monday
  });
  it("moves a weekend to Monday", () => {
    expect(nextWorkday(new Date(2026, 8, 12, 10, 0)).getDate()).toBe(14);
  });
  it("leaves a weekday alone", () => {
    expect(nextWorkday(new Date(2026, 8, 10, 10, 0)).getDate()).toBe(10);
  });
});

describe("slotFor", () => {
  it("keeps the requested day when it is a workday", () => {
    const slot = slotFor(new Date(2026, 8, 10, 9, 0), 30, NOW);
    expect(slot.start.getDate()).toBe(10);
    expect(slot.end.getTime() - slot.start.getTime()).toBe(30 * 60_000);
  });

  it("never schedules in the past", () => {
    const slot = slotFor(new Date(2026, 8, 1, 9, 0), 30, NOW);
    expect(slot.start.getTime()).toBeGreaterThan(NOW.getTime());
  });

  it("pushes a weekend request to Monday", () => {
    const slot = slotFor(new Date(2026, 8, 12, 10, 0), 30, NOW);
    expect(isWeekend(slot.start)).toBe(false);
    expect(slot.start.getDate()).toBe(14);
  });

  it("moves an after-hours time to the next morning", () => {
    const slot = slotFor(new Date(2026, 8, 10, 22, 0), 30, NOW);
    expect(slot.start.getHours()).toBe(9);
    expect(slot.start.getDate()).toBe(11);
  });

  it("never lands on a weekend even after being pushed", () => {
    // Friday evening rolls to Saturday, which must roll on to Monday.
    const slot = slotFor(new Date(2026, 8, 11, 23, 0), 30, NOW);
    expect(isWeekend(slot.start)).toBe(false);
  });
});

describe("describeSlot", () => {
  it("reads as a human date and time", () => {
    const text = describeSlot({ start: new Date(2026, 8, 15, 9, 0), end: new Date(2026, 8, 15, 9, 30) });
    expect(text).toMatch(/Sep/);
    expect(text).toMatch(/9/);
  });
});

describe("abbreviated weekdays", () => {
  // A Wednesday.
  const now = new Date("2026-09-09T10:00:00");

  it("reads the short forms people actually say", () => {
    for (const text of ["Thu", "Thurs", "thursday", "by Thurs."]) {
      const at = parseDue(text, now);
      expect(at, text).not.toBeNull();
      expect(at!.getDay(), text).toBe(4);
    }
  });

  it("still means the next one, never today", () => {
    expect(parseDue("Wed", now)!.getDate()).toBe(16);
  });

  it("does not fire on a word that merely contains one", () => {
    expect(parseDue("saturate the market", now)).toBeNull();
  });
});

describe("dueLabel", () => {
  const now = new Date("2026-09-09T10:00:00");

  it("names the near days rather than dating them", () => {
    expect(dueLabel(new Date("2026-09-09T09:00:00"), now)).toBe("Today");
    expect(dueLabel(new Date("2026-09-10T09:00:00"), now)).toBe("Tomorrow");
  });

  it("uses the weekday inside the coming week and a date beyond it", () => {
    expect(dueLabel(new Date("2026-09-11T09:00:00"), now)).toBe("Friday");
    expect(dueLabel(new Date("2026-09-30T09:00:00"), now)).not.toMatch(/day$/);
  });

  it("dates the past, so a gone Monday is not read as a coming one", () => {
    expect(dueLabel(new Date("2026-09-07T09:00:00"), now)).not.toBe("Monday");
    expect(isOverdue(new Date("2026-09-07T09:00:00"), now)).toBe(true);
    expect(isOverdue(new Date("2026-09-09T23:00:00"), now)).toBe(false);
  });
});
