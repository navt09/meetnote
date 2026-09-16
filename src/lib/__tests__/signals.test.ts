import { describe, expect, it } from "vitest";
import {
  cleanCompetitors,
  COMPETITORS_MAX,
  excerpt,
  findCompetitors,
  findMoney,
  findNextMeeting,
  findSignals,
} from "../signals";
import type { TranscriptSegment } from "../schema";

function seg(text: string, start = 0, speaker = "Speaker 1"): TranscriptSegment {
  return { speaker, text, start, end: start + 5 };
}

describe("cleanCompetitors", () => {
  it("accepts a pasted comma or newline list", () => {
    expect(cleanCompetitors("Gong, Chorus\nFireflies")).toEqual(["Gong", "Chorus", "Fireflies"]);
  });

  it("drops blanks, single letters and case-insensitive duplicates, keeping the first spelling", () => {
    expect(cleanCompetitors(["Gong", " ", "x", "GONG", "  Otter  "])).toEqual(["Gong", "Otter"]);
  });

  it("is bounded", () => {
    const many = Array.from({ length: 50 }, (_, i) => `Rival ${i}`);
    expect(cleanCompetitors(many)).toHaveLength(COMPETITORS_MAX);
    expect(cleanCompetitors(["a".repeat(100)])[0]).toHaveLength(40);
  });

  it("ignores anything that is not text", () => {
    expect(cleanCompetitors(null)).toEqual([]);
    expect(cleanCompetitors([1, { name: "Gong" }, "Gong"])).toEqual(["Gong"]);
  });
});

describe("findCompetitors", () => {
  it("finds a name as a whole word, ignoring case, with the line it came from", () => {
    const hits = findCompetitors([seg("We looked at gong but it was too expensive.", 760, "Priya")], ["Gong"]);
    expect(hits).toHaveLength(1);
    expect(hits[0].name).toBe("Gong");
    expect(hits[0].mentions[0]).toMatchObject({ text: "gong", start: 760, speaker: "Priya" });
    expect(hits[0].mentions[0].excerpt).toContain("We looked at gong");
  });

  it("does not find a name inside another word", () => {
    // "Gong" inside "ongoing" would not, but "Close" inside "closer" would with a naive search.
    expect(findCompetitors([seg("We're getting closer to an ongoing deal.")], ["Close", "Gong"])).toEqual([]);
  });

  it("never reports a name that is not on the list, however obvious", () => {
    expect(findCompetitors([seg("Honestly Salesforce is what we use.")], ["Gong"])).toEqual([]);
  });

  it("copes with names that are not plain words", () => {
    const hits = findCompetitors([seg("They moved to Monday.com last year, and C++ shops hate it.")], ["monday.com", "C++"]);
    expect(hits.map((h) => h.name).sort()).toEqual(["C++", "monday.com"]);
  });

  it("puts the most discussed competitor first", () => {
    const hits = findCompetitors(
      [seg("Otter came up."), seg("Gong, Gong and more Gong.")],
      ["Otter", "Gong"],
    );
    expect(hits.map((h) => h.name)).toEqual(["Gong", "Otter"]);
    expect(hits[0].mentions).toHaveLength(3);
  });

  it("finds nothing when nothing is tracked", () => {
    expect(findCompetitors([seg("Gong Gong Gong")], [])).toEqual([]);
  });
});

describe("findMoney", () => {
  const found = (text: string) => findMoney([seg(text)]).map((m) => m.text);

  it("finds amounts written with a currency symbol", () => {
    expect(found("We're paying about $40k a year for the current tool.")).toEqual(["$40k a year"]);
    expect(found("The budget is $20,000.")).toEqual(["$20,000"]);
    expect(found("It came to £5.5 million in the end.")).toEqual(["£5.5 million"]);
    expect(found("€300 per seat")).toEqual(["€300 per seat"]);
  });

  it("finds amounts said with a currency word", () => {
    expect(found("maybe 40 thousand dollars annually")).toEqual(["40 thousand dollars annually"]);
    expect(found("it's twenty 20 grand a month")).toEqual(["20 grand a month"]);
  });

  it("finds a pricing unit said without a figure", () => {
    expect(found("Is that priced per seat or flat?")).toEqual(["per seat"]);
  });

  it("does not call a bare number money", () => {
    expect(found("We need 4k video, 20 minutes, and version 2.5 by May.")).toEqual([]);
  });

  it("keeps where each amount was said", () => {
    const [m] = findMoney([seg("That would be $12,000.", 95, "Sam")]);
    expect(m).toMatchObject({ start: 95, speaker: "Sam" });
  });
});

describe("findNextMeeting", () => {
  // A Tuesday morning.
  const recorded = new Date(2026, 8, 15, 10, 0, 0);

  it("resolves the day against when the meeting was recorded, not against now", () => {
    const next = findNextMeeting([seg("Great. Let's meet again on Thursday to go through it.")], recorded);
    expect(next?.date).toBe("2026-09-17");
  });

  it("needs the sentence to be about meeting again, not just to contain a day", () => {
    expect(findNextMeeting([seg("The invoice goes out on Thursday.")], recorded)).toBeNull();
  });

  it("does not read ordinary words as abbreviated weekdays", () => {
    // "sat" and "sun" are accepted day names in a due date. In a sentence they are not.
    expect(findNextMeeting([seg("Let's catch up once we've sat in the sun a bit.")], recorded)).toBeNull();
  });

  it("skips a sentence about a meeting that already happened", () => {
    expect(findNextMeeting([seg("We met last Tuesday and said we'd catch up Tuesday.")], recorded)).toBeNull();
  });

  it("takes the last plan made, because that is the settled one", () => {
    const next = findNextMeeting(
      [seg("Could we regroup on Wednesday?", 10, "A"), seg("Actually Wednesday's bad. Let's catch up Friday instead.", 20, "B")],
      recorded,
    );
    expect(next?.speaker).toBe("B");
    expect(next?.date).toBe("2026-09-18");
    expect(next?.excerpt).toContain("catch up Friday");
  });

  it("understands tomorrow and next week", () => {
    expect(findNextMeeting([seg("Let's sync tomorrow.")], recorded)?.date).toBe("2026-09-16");
    expect(findNextMeeting([seg("Next meeting is next week.")], recorded)).not.toBeNull();
  });

  it("places a month and day in the year that makes it upcoming", () => {
    expect(findNextMeeting([seg("Let's reconvene on January 8th.")], recorded)?.date).toBe("2027-01-08");
  });

  it("refuses a date that does not exist", () => {
    expect(findNextMeeting([seg("Let's reconvene on September 31.")], recorded)).toBeNull();
  });

  it("sends a calendar day, not an instant a time zone can move", () => {
    expect(findNextMeeting([seg("Let's meet again on Thursday.")], recorded)?.date).toMatch(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/);
  });

  it("gives the same answer however much later it is read", () => {
    const segments = [seg("Let's touch base on Monday.")];
    expect(findNextMeeting(segments, recorded)).toEqual(findNextMeeting(segments, recorded));
  });
});

describe("excerpt", () => {
  it("keeps short lines whole", () => {
    expect(excerpt("We use Gong.", 7, 4)).toBe("We use Gong.");
  });

  it("cuts long lines at a word, and says it did", () => {
    const text = `${"word ".repeat(40)}Gong${" word".repeat(40)}`;
    const out = excerpt(text, text.indexOf("Gong"), 4, 20);
    expect(out.startsWith("…")).toBe(true);
    expect(out.endsWith("…")).toBe(true);
    expect(out).toContain("Gong");
    expect(out).not.toMatch(/…\S*or…/);
  });
});

describe("findSignals", () => {
  it("says how many competitors are tracked even when none were found", () => {
    const s = findSignals([seg("Nothing much.")], ["Gong", "Otter"], new Date(2026, 8, 15));
    expect(s).toEqual({ competitors: [], money: [], nextMeeting: null, competitorsTracked: 2 });
  });
});
