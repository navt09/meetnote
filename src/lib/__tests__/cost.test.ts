import { describe, expect, it } from "vitest";
import { formatUsd, llmCostUsd, transcriptionCostUsd } from "../cost";

describe("llmCostUsd", () => {
  it("prices input and output tokens at Opus 5 rates", () => {
    // 1M input = $5, 1M output = $25
    expect(llmCostUsd({ input_tokens: 1_000_000, output_tokens: 0 })).toBeCloseTo(5, 6);
    expect(llmCostUsd({ input_tokens: 0, output_tokens: 1_000_000 })).toBeCloseTo(25, 6);
  });

  it("adds cache reads and writes at their own rates", () => {
    const c = llmCostUsd({ input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 1_000_000, cache_creation_input_tokens: 1_000_000 });
    expect(c).toBeCloseTo(0.5 + 6.25, 6);
  });

  it("treats null cache fields as zero", () => {
    expect(llmCostUsd({ input_tokens: 1000, output_tokens: 1000, cache_read_input_tokens: null, cache_creation_input_tokens: null })).toBeCloseTo(0.03, 6);
  });
});

describe("transcriptionCostUsd", () => {
  it("charges per minute of audio", () => {
    expect(transcriptionCostUsd(60)).toBeCloseTo(0.0043, 6);
    expect(transcriptionCostUsd(3600)).toBeCloseTo(0.258, 6);
  });
  it("returns 0 for bad durations", () => {
    expect(transcriptionCostUsd(0)).toBe(0);
    expect(transcriptionCostUsd(-5)).toBe(0);
    expect(transcriptionCostUsd(NaN)).toBe(0);
  });
});

describe("formatUsd", () => {
  it("shows four decimals under a cent, two otherwise", () => {
    expect(formatUsd(0.0043)).toBe("$0.0043");
    expect(formatUsd(0.25)).toBe("$0.25");
    expect(formatUsd(12)).toBe("$12.00");
  });
});
