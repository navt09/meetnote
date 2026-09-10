import { describe, expect, it } from "vitest";
import { audibleSeconds, isSelfSample, parseSelfSpeech, rmsDb, tagSelf, trailingSilenceSeconds, windowsFromMarks } from "../self-speech";
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

describe("windowsFromMarks", () => {
  /** Readings taken every `everyS` seconds, self while `self(i)` says so. */
  const series = (n: number, everyS: number, self: (i: number) => boolean) =>
    Array.from({ length: n }, (_, i) => ({ t: i * everyS, self: self(i), sound: true }));

  it("turns runs into windows on the real clock", () => {
    // sampled every 200ms: self for the first second, silent, then self again
    const marks = series(11, 0.2, (i) => i < 5 || i >= 8);
    expect(windowsFromMarks(marks)).toEqual([
      [0, 1],
      [1.6, 2.2],
    ]);
  });

  it("keeps real time when the browser throttles the timer", () => {
    // The bug this replaced: 45 readings that took 45s were reported as 9s,
    // because a sample count was multiplied by the interval we hoped for.
    const throttled = series(45, 1.04, () => true);
    const [only] = windowsFromMarks(throttled);
    expect(only[0]).toBeCloseTo(0, 3);
    expect(only[1]).toBeGreaterThan(44); // the whole recording, not a fifth of it
  });

  it("does not stretch one reading across a long gap in sampling", () => {
    // A 30s hole between two readings means we do not know what happened.
    const marks = [{ t: 0, self: true, sound: true }, { t: 0.2, self: true, sound: true }, { t: 30, self: true, sound: true }, { t: 30.2, self: true, sound: true }];
    const [first, second] = windowsFromMarks(marks);
    expect(first[1] - first[0]).toBeCloseTo(1.7, 3); // 0.2s of readings + a capped 1.5s bridge, not 30s
    expect(second[0]).toBeCloseTo(30, 3);
  });

  it("drops blips shorter than the minimum", () => {
    expect(windowsFromMarks([{ t: 0, self: false, sound: true }, { t: 0.2, self: true, sound: true }, { t: 0.4, self: false, sound: true }])).toEqual([]);
  });

  it("bridges a short gap between two words", () => {
    const marks = series(11, 0.2, (i) => i !== 5);
    expect(windowsFromMarks(marks)).toEqual([[0, 2.2]]);
  });

  it("handles an empty series", () => {
    expect(windowsFromMarks([])).toEqual([]);
  });
});

describe("audibleSeconds and trailingSilenceSeconds", () => {
  const at = (t: number, sound: boolean) => ({ t, self: false, sound });

  it("counts only the time anything was audible", () => {
    // sound for the first second, then silence
    const marks = [at(0, true), at(0.5, true), at(1, false), at(1.5, false), at(2, false)];
    expect(audibleSeconds(marks)).toBeCloseTo(1, 3);
  });

  it("reports nothing audible in a wholly silent recording", () => {
    expect(audibleSeconds([at(0, false), at(1, false), at(2, false)])).toBe(0);
  });

  it("measures how long it has been silent at the end", () => {
    const marks = [at(0, true), at(1, true), at(2, false), at(60, false)];
    expect(trailingSilenceSeconds(marks)).toBeCloseTo(59, 3);
  });

  it("treats a recording that never had sound as silent throughout", () => {
    expect(trailingSilenceSeconds([at(0, false), at(90, false)])).toBeCloseTo(90, 3);
  });

  it("is not silent when sound is still arriving", () => {
    expect(trailingSilenceSeconds([at(0, true), at(1, true)])).toBe(0);
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
