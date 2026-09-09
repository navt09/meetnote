// Plain arithmetic for what each meeting costs us. No AI involved.
// Prices are USD list prices; update here if a vendor changes them.

export const PRICING = {
  // Anthropic Claude Opus 5, per 1M tokens
  opus5: { inputPerM: 5, outputPerM: 25, cacheReadPerM: 0.5, cacheWritePerM: 6.25 },
  // Deepgram Nova-3 pre-recorded, pay as you go, billed per second
  deepgramNova3PerMinute: 0.0043,
} as const;

export type LlmUsage = {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
};

export function llmCostUsd(u: LlmUsage): number {
  const p = PRICING.opus5;
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
  return (audioSeconds / 60) * PRICING.deepgramNova3PerMinute;
}

export function formatUsd(n: number): string {
  if (n < 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(2)}`;
}
