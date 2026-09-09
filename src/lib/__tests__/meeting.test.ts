import { describe, expect, it } from "vitest";
import { defaultTitle, isInProgress, nextStep, statusLabel } from "../meeting";

const seg = [{ speaker: "Speaker 0", text: "hi", start: 0, end: 1 }];
const notes = {
  title: "t", summary: "s", key_points: [], action_items: [], decisions: [], people_to_contact: [], open_questions: [], for_you: { committed: [], asked_of_you: [], heads_up: [], mentioned: [] },
};

describe("nextStep", () => {
  it("transcribes when only audio exists", () => {
    expect(nextStep({ storage_path: "u/2026-09/m.webm", transcript: null, notes: null })).toBe("transcribe");
  });
  it("extracts when transcript exists but notes don't", () => {
    expect(nextStep({ storage_path: "p", transcript: seg, notes: null })).toBe("extract");
  });
  it("treats an empty transcript as needing transcription again", () => {
    expect(nextStep({ storage_path: "p", transcript: [], notes: null })).toBe("transcribe");
  });
  it("does nothing when notes exist", () => {
    expect(nextStep({ storage_path: "p", transcript: seg, notes })).toBe("none");
  });
  it("does nothing when there is no audio at all", () => {
    expect(nextStep({ storage_path: null, transcript: null, notes: null })).toBe("none");
  });
});

describe("status helpers", () => {
  it("knows which states are in flight", () => {
    expect(isInProgress("transcribing")).toBe(true);
    expect(isInProgress("extracting")).toBe(true);
    expect(isInProgress("done")).toBe(false);
    expect(isInProgress("error")).toBe(false);
  });
  it("has a label for every status", () => {
    for (const s of ["recorded", "uploaded", "transcribing", "transcribed", "extracting", "done", "error"] as const) {
      expect(statusLabel(s).length).toBeGreaterThan(0);
    }
  });
  it("builds a readable default title", () => {
    expect(defaultTitle(new Date("2026-09-08T16:30:00"))).toMatch(/^Meeting · /);
  });
});
