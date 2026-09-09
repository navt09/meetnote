import { describe, expect, it } from "vitest";
import { formatTimestamp, normalizeUtterances, wordCount } from "../transcript";

describe("normalizeUtterances", () => {
  it("merges quick consecutive lines from the same speaker", () => {
    const out = normalizeUtterances([
      { speaker: 1, transcript: "Also,", start: 28.27, end: 28.99 },
      { speaker: 1, transcript: "we decided to postpone dark mode", start: 29.15, end: 32.75 },
      { speaker: 0, transcript: "Sounds good.", start: 33.0, end: 33.8 },
    ]);
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual({ speaker: "Speaker 1", text: "Also, we decided to postpone dark mode", start: 28.27, end: 32.75 });
    expect(out[1].speaker).toBe("Speaker 0");
  });

  it("does not merge across a long pause", () => {
    const out = normalizeUtterances([
      { speaker: 0, transcript: "First.", start: 0, end: 1 },
      { speaker: 0, transcript: "Much later.", start: 10, end: 11 },
    ]);
    expect(out).toHaveLength(2);
  });

  it("drops empty and whitespace-only utterances", () => {
    const out = normalizeUtterances([
      { speaker: 0, transcript: "   ", start: 0, end: 1 },
      { speaker: 0, transcript: "", start: 1, end: 2 },
      { speaker: 0, transcript: "Hi", start: 2, end: 3 },
    ]);
    expect(out).toEqual([{ speaker: "Speaker 0", text: "Hi", start: 2, end: 3 }]);
  });

  it("defaults a missing speaker to 0", () => {
    const out = normalizeUtterances([{ transcript: "x", start: 0, end: 1 }]);
    expect(out[0].speaker).toBe("Speaker 0");
  });

  it("handles an empty list", () => {
    expect(normalizeUtterances([])).toEqual([]);
  });
});

describe("formatTimestamp", () => {
  it("formats minutes and hours", () => {
    expect(formatTimestamp(0)).toBe("0:00");
    expect(formatTimestamp(65)).toBe("1:05");
    expect(formatTimestamp(3599)).toBe("59:59");
    expect(formatTimestamp(3600)).toBe("1:00:00");
    expect(formatTimestamp(3725.9)).toBe("1:02:05");
  });
  it("clamps negatives", () => {
    expect(formatTimestamp(-3)).toBe("0:00");
  });
});

describe("wordCount", () => {
  it("counts words across segments", () => {
    expect(
      wordCount([
        { speaker: "a", text: "one two  three", start: 0, end: 1 },
        { speaker: "b", text: " four ", start: 1, end: 2 },
      ]),
    ).toBe(4);
  });
});
