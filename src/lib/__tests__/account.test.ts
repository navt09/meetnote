import { describe, expect, it } from "vitest";
import {
  atLeast,
  canConnect,
  canDraft,
  canSeeInternals,
  FREE_MEETINGS_PER_MONTH,
  hasMeetingsLeft,
  isTier,
  meetingsLeft,
  monthlyMeetingAllowance,
  monthStart,
  TIER_LABEL,
  TIERS,
} from "../account";

describe("isTier", () => {
  it("accepts the three tiers and nothing else", () => {
    for (const t of TIERS) expect(isTier(t)).toBe(true);
    for (const bad of ["admin", "paid", "", "OWNER", "premium"]) expect(isTier(bad)).toBe(false);
  });
});

describe("atLeast", () => {
  it("orders free below active below owner", () => {
    expect(atLeast("owner", "active")).toBe(true);
    expect(atLeast("active", "active")).toBe(true);
    expect(atLeast("free", "active")).toBe(false);
    expect(atLeast("active", "owner")).toBe(false);
    expect(atLeast("free", "free")).toBe(true);
  });
});

describe("what each tier may do", () => {
  it("keeps a free account away from drafting and from connected apps", () => {
    expect(canDraft("free")).toBe(false);
    expect(canConnect("free")).toBe(false);
  });

  it("gives a paid account both", () => {
    for (const tier of ["active", "owner"] as const) {
      expect(canDraft(tier), tier).toBe(true);
      expect(canConnect(tier), tier).toBe(true);
    }
  });

  it("hides the internal cost figures from paying customers, not just free ones", () => {
    expect(canSeeInternals("owner")).toBe(true);
    expect(canSeeInternals("active")).toBe(false);
    expect(canSeeInternals("free")).toBe(false);
  });
});

describe("the monthly meeting allowance", () => {
  it("meters a free account rather than shutting it out", () => {
    expect(monthlyMeetingAllowance("free")).toBe(FREE_MEETINGS_PER_MONTH);
    expect(hasMeetingsLeft("free", 0)).toBe(true);
    expect(hasMeetingsLeft("free", FREE_MEETINGS_PER_MONTH - 1)).toBe(true);
  });

  it("stops a free account once the allowance is spent", () => {
    expect(hasMeetingsLeft("free", FREE_MEETINGS_PER_MONTH)).toBe(false);
    expect(hasMeetingsLeft("free", FREE_MEETINGS_PER_MONTH + 5)).toBe(false);
    expect(meetingsLeft("free", FREE_MEETINGS_PER_MONTH + 5)).toBe(0);
  });

  it("never caps a paid account", () => {
    for (const tier of ["active", "owner"] as const) {
      expect(monthlyMeetingAllowance(tier), tier).toBe(Number.POSITIVE_INFINITY);
      expect(hasMeetingsLeft(tier, 10_000), tier).toBe(true);
    }
  });

  it("counts down what is left", () => {
    expect(meetingsLeft("free", 0)).toBe(FREE_MEETINGS_PER_MONTH);
    expect(meetingsLeft("free", 1)).toBe(FREE_MEETINGS_PER_MONTH - 1);
  });
});

describe("monthStart", () => {
  it("goes back to the first of the month at midnight UTC", () => {
    expect(monthStart(new Date("2026-09-17T13:45:12.500Z")).toISOString()).toBe("2026-09-01T00:00:00.000Z");
  });

  it("is already the answer on the first of the month", () => {
    expect(monthStart(new Date("2026-09-01T00:00:00.000Z")).toISOString()).toBe("2026-09-01T00:00:00.000Z");
  });

  it("does not slip into the previous month for a late-evening time", () => {
    // The trap: a local-time boundary would put this in August for anyone west
    // of UTC, handing them a second allowance for the same month.
    expect(monthStart(new Date("2026-09-01T23:30:00.000Z")).toISOString()).toBe("2026-09-01T00:00:00.000Z");
  });
});

describe("labels", () => {
  it("has a label for every tier", () => {
    for (const t of TIERS) expect(TIER_LABEL[t].length).toBeGreaterThan(0);
  });
});
