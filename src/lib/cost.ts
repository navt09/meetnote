// Plain arithmetic for what each meeting costs us. No AI involved.
// Prices are USD list prices; update here if a vendor changes them.

/**
 * Priced by the exact model string the call site used, so extraction and
 * drafting can run different models without either one costing itself out at
 * the other's rate. Cache read/write multipliers follow Anthropic's standard
 * ratios (~0.1x input for a read, ~1.25x input for a write) for every model.
 */
export const MODEL_PRICING = {
  "claude-opus-5": { inputPerM: 5, outputPerM: 25, cacheReadPerM: 0.5, cacheWritePerM: 6.25 },
  "claude-sonnet-5": { inputPerM: 2, outputPerM: 10, cacheReadPerM: 0.2, cacheWritePerM: 2.5 },
} as const;

export type PricedModel = keyof typeof MODEL_PRICING;

// Deepgram Nova-3 pre-recorded, pay as you go, billed per second
const DEEPGRAM_NOVA3_PER_MINUTE = 0.0043;

export type LlmUsage = {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
};

/** `model` is required, not defaulted: a call site naming a model it didn't use is a bug worth a compile error. */
export function llmCostUsd(u: LlmUsage, model: PricedModel): number {
  const p = MODEL_PRICING[model];
  const cacheRead = u.cache_read_input_tokens ?? 0;
  const cacheWrite = u.cache_creation_input_tokens ?? 0;
  return (
    (u.input_tokens * p.inputPerM +
      u.output_tokens * p.outputPerM +
      cacheRead * p.cacheReadPerM +
      cacheWrite * p.cacheWritePerM) /
    1_000_000
  );
}

export function transcriptionCostUsd(audioSeconds: number): number {
  if (!Number.isFinite(audioSeconds) || audioSeconds <= 0) return 0;
  return (audioSeconds / 60) * DEEPGRAM_NOVA3_PER_MINUTE;
}

export function formatUsd(n: number): string {
  if (n < 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(2)}`;
}
