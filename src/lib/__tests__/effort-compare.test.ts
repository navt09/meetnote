import { describe, expect, it } from "vitest";
import {
  cheapestLossless,
  diffRuns,
  matchesLoosely,
  normalizeText,
  pairUp,
  similarity,
  type ComparableNotes,
  type Run,
} from "../effort-compare";

function item(title: string, owner: string | null = null, due: string | null = null) {
  return { title, owner, due };
}

function notes(partial: Partial<ComparableNotes>): ComparableNotes {
  return { action_items: [], decisions: [], people_to_contact: [], ...partial };
}

describe("normalizeText", () => {
  it("lowercases, strips punctuation and collapses whitespace", () => {
    expect(normalizeText("  Ship the  Migration!! ")).toBe("ship the migration");
    expect(normalizeText("Fix login-bug (urgent)")).toBe("fix login bug urgent");
  });
});

describe("matchesLoosely", () => {
  it("matches items that differ only in punctuation, case or spacing", () => {
    expect(matchesLoosely("Ship the migration", "ship   the MIGRATION.")).toBe(true);
    expect(matchesLoosely("Fix login-bug", "Fix login bug")).toBe(true);
  });

  it("matches items that differ only in wording", () => {
    expect(matchesLoosely("Ship the migration script", "Ship migration script to staging")).toBe(true);
    expect(matchesLoosely("Email Dana about the contract", "Email Dana the contract")).toBe(true);
  });

  it("does not match two genuinely different items", () => {
    expect(matchesLoosely("Ship the migration script", "Book the offsite venue")).toBe(false);
    expect(similarity("Ship the migration script", "Book the offsite venue")).toBe(0);
  });
});

describe("pairUp", () => {
  it("uses each item at most once, best match first", () => {
    const { pairs, onlyLeft, onlyRight } = pairUp(["Fix login bug", "Fix logout bug"], ["fix the login bug"]);
    expect(pairs).toEqual([[0, 0]]);
    expect(onlyLeft).toEqual([1]);
    expect(onlyRight).toEqual([]);
  });
});

describe("diffRuns", () => {
  const rich: Run = {
    level: "high",
    notes: notes({
      action_items: [item("Ship the migration script", "Dana", "Thursday"), item("Book the offsite venue")],
      decisions: [{ decision: "Move the launch to March" }],
      people_to_contact: [{ name: "Dana Okoye" }],
    }),
  };

  it("reports an item one run produced and the other did not", () => {
    const cheap: Run = {
      level: "low",
      notes: notes({
        action_items: [item("Ship migration script.", "Dana", "Thursday")],
        decisions: [],
        people_to_contact: [{ name: "Dana Okoye" }],
      }),
    };
    const d = diffRuns(cheap, rich);
    expect(d.categories.action_items.onlyInB).toEqual(["Book the offsite venue"]);
    expect(d.categories.action_items.onlyInA).toEqual([]);
    // The reworded item counted as the same one, not as a miss on both sides.
    expect(d.categories.decisions.onlyInB).toEqual(["Move the launch to March"]);
    expect(d.categories.people_to_contact.onlyInB).toEqual([]);
    expect(d.identical).toBe(false);
  });

  it("flags an owner filled in one run and blank in the other", () => {
    const cheap: Run = {
      level: "low",
      notes: notes({
        action_items: [item("Ship the migration script", null, "Thursday"), item("Book the offsite venue")],
        decisions: [{ decision: "Move the launch to March" }],
        people_to_contact: [{ name: "Dana Okoye" }],
      }),
    };
    const d = diffRuns(cheap, rich);
    expect(d.categories.action_items.onlyInA).toEqual([]);
    expect(d.categories.action_items.onlyInB).toEqual([]);
    expect(d.fieldGaps).toEqual([
      { title: "Ship the migration script", field: "owner", filledIn: "high", blankIn: "low", value: "Dana" },
    ]);
  });

  it("treats a whitespace-only owner as blank", () => {
    const cheap: Run = { level: "low", notes: notes({ action_items: [item("Ship the migration script", "   ")] }) };
    const dear: Run = { level: "high", notes: notes({ action_items: [item("Ship the migration script", "Dana")] }) };
    expect(diffRuns(cheap, dear).fieldGaps[0]).toMatchObject({ field: "owner", blankIn: "low" });
  });

  it("calls two identical runs identical despite wording and punctuation", () => {
    const other: Run = {
      level: "medium",
      notes: notes({
        action_items: [item("Ship migration script", "Dana", "Thursday"), item("Book offsite venue!")],
        decisions: [{ decision: "move the launch to march" }],
        people_to_contact: [{ name: "Dana Okoye" }],
      }),
    };
    expect(diffRuns(other, rich).identical).toBe(true);
  });
});

describe("cheapestLossless", () => {
  const full = notes({
    action_items: [item("Ship the migration script", "Dana", "Thursday")],
    decisions: [{ decision: "Move the launch to March" }],
    people_to_contact: [{ name: "Dana Okoye" }],
  });

  it("names the cheapest run that lost nothing", () => {
    const lossy: Run = { level: "low", notes: notes({ action_items: [], decisions: [], people_to_contact: [] }) };
    const same: Run = { level: "medium", notes: full };
    expect(cheapestLossless([lossy, same, { level: "high", notes: full }])).toBe("medium");
  });

  it("returns null when every cheaper run lost something", () => {
    const lossy: Run = { level: "low", notes: notes({ decisions: [{ decision: "Move the launch to March" }] }) };
    expect(cheapestLossless([lossy, { level: "high", notes: full }])).toBeNull();
  });

  it("does not count extra items in the cheap run as a loss", () => {
    const extra: Run = {
      level: "low",
      notes: notes({
        action_items: [item("Ship the migration script", "Dana", "Thursday"), item("Order more coffee")],
        decisions: [{ decision: "Move the launch to March" }],
        people_to_contact: [{ name: "Dana Okoye" }],
      }),
    };
    expect(cheapestLossless([extra, { level: "high", notes: full }])).toBe("low");
  });
});
