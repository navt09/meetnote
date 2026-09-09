import { describe, expect, it } from "vitest";
import { atLeast, canRecord, canSeeInternals, canUseAi, isTier, TIER_LABEL, TIERS } from "../account";

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
  it("keeps free accounts away from anything that costs money", () => {
    expect(canRecord("free")).toBe(false);
    expect(canUseAi("free")).toBe(false);
  });

  it("lets active accounts record and use the AI", () => {
    expect(canRecord("active")).toBe(true);
    expect(canUseAi("active")).toBe(true);
  });

  it("gives the owner everything", () => {
    expect(canRecord("owner")).toBe(true);
    expect(canUseAi("owner")).toBe(true);
    expect(canSeeInternals("owner")).toBe(true);
  });

  it("hides the internal cost figures from paying customers, not just free ones", () => {
    expect(canSeeInternals("active")).toBe(false);
    expect(canSeeInternals("free")).toBe(false);
  });
});

describe("labels", () => {
  it("has a label for every tier", () => {
    for (const t of TIERS) expect(TIER_LABEL[t].length).toBeGreaterThan(0);
  });
});
