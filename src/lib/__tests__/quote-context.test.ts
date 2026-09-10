import { describe, it, expect } from "vitest";
import { locateQuote, quoteContext, NEIGHBOUR_MAX } from "../quote-context";
import type { TranscriptSegment } from "../schema";

const seg = (speaker: string, text: string, start: number): TranscriptSegment => ({
  speaker,
  text,
  start,
  end: start + 5,
});

const MEETING: TranscriptSegment[] = [
  seg("Marcus", "Right, the login refactor is merged so that is off the list.", 0),
  seg("Marcus", "The last thing anyone flagged was the export, and I have not looked at it.", 6),
  seg("Priya", "I found a crash in the export on anything over ten thousand rows.", 13),
  seg("Marcus", "How big are the files people are actually exporting?", 20),
  seg("Priya", "Customer facing, so it matters. I will have a fix by Friday.", 26),
];

describe("locateQuote", () => {
  it("finds the segment holding the quote", () => {
    expect(locateQuote("I found a crash in the export on anything over ten thousand rows.", MEETING)).toEqual([2, 2]);
  });

  it("matches a quote that is part of a longer line", () => {
    expect(locateQuote("I will have a fix by Friday", MEETING)).toEqual([4, 4]);
  });

  it("ignores a difference of punctuation and case", () => {
    // The transcript arrives with smart quotes; the model's copy has straight
    // ones. That is not a difference in what was said.
    const smart = [seg("Priya", "It’s the export that’s crashing, not the report.", 0)];
    expect(locateQuote("it's the export that's crashing", smart)).toEqual([0, 0]);
  });

  it("spans the segments a longer quote runs across", () => {
    const quote =
      "How big are the files people are actually exporting? Customer facing, so it matters. I will have a fix by Friday.";
    expect(locateQuote(quote, MEETING)).toEqual([3, 4]);
  });

  it("refuses a quote too short to place", () => {
    // "Yes." appears in half the segments of any meeting, so a match on it
    // would point at whichever one happened to come first.
    expect(locateQuote("Yes.", MEETING)).toBeNull();
    expect(locateQuote("", MEETING)).toBeNull();
  });

  it("returns null when the quote is not in the transcript at all", () => {
    expect(locateQuote("We agreed to rewrite the billing system in Haskell", MEETING)).toBeNull();
  });

  it("returns null for an empty transcript", () => {
    expect(locateQuote("I found a crash in the export", [])).toBeNull();
  });
});

describe("quoteContext", () => {
  it("gives the line before and the line after, with who said each", () => {
    const around = quoteContext("I found a crash in the export on anything over ten thousand rows.", MEETING);
    expect(around).toEqual({
      before: { speaker: "Marcus", text: "The last thing anyone flagged was the export, and I have not looked at it." },
      after: { speaker: "Marcus", text: "How big are the files people are actually exporting?" },
    });
  });

  it("takes the lines either side of a span, not either side of one segment", () => {
    // Both of the last two segments sit inside this quote, so the span is the
    // pair of them and the line before is the one before the first.
    const quote =
      "How big are the files people are actually exporting? Customer facing, so it matters. I will have a fix by Friday.";
    const around = quoteContext(quote, MEETING);
    expect(around?.before?.text).toContain("I found a crash in the export");
    // The span ends on the last segment, so there is nothing after it.
    expect(around?.after).toBeNull();
  });

  it("has no line before when the quote opens the meeting", () => {
    const around = quoteContext("the login refactor is merged so that is off the list", MEETING);
    expect(around?.before).toBeNull();
    expect(around?.after?.speaker).toBe("Marcus");
  });

  it("is null when there is no quote to place", () => {
    expect(quoteContext(null, MEETING)).toBeNull();
    expect(quoteContext("   ", MEETING)).toBeNull();
    expect(quoteContext("nothing like this was ever said here", MEETING)).toBeNull();
  });

  it("is null when the quote is the only thing in the transcript", () => {
    const alone = [seg("Priya", "I found a crash in the export on large files.", 0)];
    expect(quoteContext("I found a crash in the export on large files.", alone)).toBeNull();
  });

  it("keeps the end of a long line before, and the start of a long one after", () => {
    const long = "word ".repeat(120).trim();
    const around = quoteContext("this is the quote in the middle of it all", [
      seg("A", `${long} and then the important bit right here`, 0),
      seg("B", "This is the quote in the middle of it all.", 10),
      seg("C", `the answer starts here and then ${long}`, 20),
    ]);
    expect(around?.before?.text.length).toBeLessThanOrEqual(NEIGHBOUR_MAX + 2);
    expect(around?.before?.text.startsWith("…")).toBe(true);
    expect(around?.before?.text.endsWith("important bit right here")).toBe(true);
    expect(around?.after?.text.startsWith("the answer starts here")).toBe(true);
    expect(around?.after?.text.endsWith("…")).toBe(true);
  });

  it("skips a neighbour that is only whitespace", () => {
    const around = quoteContext("I found a crash in the export on large files", [
      seg("A", "   ", 0),
      seg("B", "I found a crash in the export on large files.", 6),
      seg("C", "", 12),
    ]);
    expect(around).toBeNull();
  });
});
