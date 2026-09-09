import { describe, expect, it } from "vitest";
import { compactWindows, isSelfSample, parseSelfSpeech, rmsDb, tagSelf } from "../self-speech";
import type { TranscriptSegment } from "../schema";

describe("isSelfSample", () => {
  it("is silent below the floor no matter what the meeting is doing", () => {
    expect(isSelfSample(-60, -100, true)).toBe(false);
    expect(isSelfSample(-60, -100, false)).toBe(false);
  });
  it("needs the mic to clearly beat the meeting audio, so speaker bleed does not count", () => {
    expect(isSelfSample(-20, -22, true)).toBe(false); // 2 dB: bleed
    expect(isSelfSample(-20, -30, true)).toBe(true); // 10 dB: a person at the mic
  });
  it("with no meeting audio, anything above the floor is the user", () => {
    expect(isSelfSample(-30, -100, false)).toBe(true);
  });
});

describe("rmsDb", () => {
  it("floors silence at -100 rather than -Infinity", () => {
    expect(rmsDb(new Float32Array(8))).toBe(-100);
  });
  it("puts a full-scale square wave at 0 dB", () => {
    expect(rmsDb(new Float32Array([1, -1, 1, -1]))).toBeCloseTo(0, 5);
  });
});

describe("compactWindows", () => {
  const on = true, off = false;
  it("turns runs into windows in seconds", () => {
    // 200 ms samples: on for 5 samples = 1 s, off, on for 3 = 0.6 s
    expect(compactWindows([on, on, on, on, on, off, off, off, on, on, on])).toEqual([
      [0, 1],
      [1.6, 2.2],
    ]);
  });
  it("drops blips shorter than the minimum", () => {
    expect(compactWindows([off, on, off, off])).toEqual([]);
  });
  it("bridges a short gap between two words", () => {
    // 1 s on, one sample (200 ms) off, 1 s on -> one window
    expect(compactWindows([on, on, on, on, on, off, on, on, on, on, on])).toEqual([[0, 2.2]]);
  });
  it("handles an empty series", () => {
    expect(compactWindows([])).toEqual([]);
  });
});

describe("parseSelfSpeech", () => {
  it("drops garbage instead of failing", () => {
    expect(parseSelfSpeech("nope", 100)).toEqual([]);
    expect(parseSelfSpeech([[1], ["a", "b"], [5, 2], null], 100)).toEqual([]);
  });
  it("clamps to the recording length, sorts, and merges overlaps", () => {
    expect(parseSelfSpeech([[50, 500], [1, 3], [2, 4]], 100)).toEqual([
      [1, 4],
      [50, 100],
    ]);
  });
  it("falls back to a sane cap when the duration is unknown", () => {
    expect(parseSelfSpeech([[0, 99999]], NaN)).toEqual([[0, 4 * 3600]]);
  });
});

describe("tagSelf", () => {
  const seg = (speaker: string, text: string, start: number, end: number): TranscriptSegment => ({ speaker, text, start, end });

  it("leaves everything alone with no windows", () => {
    const s = [seg("Speaker 0", "hi", 0, 1)];
    expect(tagSelf(s, [])).toBe(s);
  });
  it("relabels a segment mostly inside the windows", () => {
    const out = tagSelf([seg("Speaker 1", "I will do it", 10, 14), seg("Speaker 0", "great", 14, 15)], [[9, 13]], "Naveen");
    expect(out.map((s) => s.speaker)).toEqual(["Naveen", "Speaker 0"]);
  });
  it("does not relabel a segment that only brushes a window", () => {
    const out = tagSelf([seg("Speaker 1", "long line", 0, 10)], [[9, 12]], "Naveen");
    expect(out[0].speaker).toBe("Speaker 1");
  });
  it("merges consecutive self segments that diarisation split", () => {
    const out = tagSelf(
      [seg("Speaker 0", "first half", 0, 2), seg("Speaker 2", "second half", 2.5, 4), seg("Speaker 1", "someone else", 6, 7)],
      [[0, 4]],
      "You",
    );
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ speaker: "You", text: "first half second half", start: 0, end: 4 });
  });
  it("does not mutate the input", () => {
    const s = [seg("Speaker 0", "x", 0, 1)];
    tagSelf(s, [[0, 1]]);
    expect(s[0].speaker).toBe("Speaker 0");
  });
});
