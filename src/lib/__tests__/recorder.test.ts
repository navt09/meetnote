import { describe, expect, it } from "vitest";
import { SILENCE_GRACE_SECONDS, SILENCE_PROMPT_SECONDS, silenceAction } from "../recorder";

const STOP_AT = SILENCE_PROMPT_SECONDS + SILENCE_GRACE_SECONDS;

describe("silenceAction", () => {
  it("says nothing during a pause someone might reasonably take", () => {
    for (const s of [0, 30, 90, SILENCE_PROMPT_SECONDS - 1]) {
      expect(silenceAction(s, false), `${s}s`).toBe("none");
    }
  });

  it("asks once the silence is longer than anyone thinks", () => {
    expect(silenceAction(SILENCE_PROMPT_SECONDS, false)).toBe("ask");
    expect(silenceAction(STOP_AT - 1, false)).toBe("ask");
  });

  it("stops only after the question has gone unanswered for the grace period", () => {
    expect(silenceAction(STOP_AT, false)).toBe("stop");
    expect(silenceAction(STOP_AT + 600, false)).toBe("stop");
  });

  it("never stops a meeting someone has said is still going", () => {
    for (const s of [SILENCE_PROMPT_SECONDS, STOP_AT, STOP_AT + 3600]) {
      expect(silenceAction(s, true), `${s}s answered`).toBe("none");
    }
  });

  it("does nothing on a reading that is not a number", () => {
    expect(silenceAction(Number.NaN, false)).toBe("none");
    expect(silenceAction(Number.POSITIVE_INFINITY, false)).toBe("none");
  });
});
