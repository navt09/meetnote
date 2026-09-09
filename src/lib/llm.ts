import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { loadConnector } from "./connector-store";
import type { LlmConfig, LlmCredentials } from "./connectors";

/**
 * Which Anthropic key to use. A customer can supply their own, in which case
 * the model work is billed to them rather than to us. Everything else about
 * the pipeline is identical.
 */
export type LlmChoice = { client: Anthropic; model: string; ownKey: boolean };

export const DEFAULT_MODEL = "claude-opus-5";

/** Models a customer may pick when bringing their own key. */
export const ALLOWED_MODELS = ["claude-opus-5", "claude-sonnet-5", "claude-haiku-4-5"] as const;
export type AllowedModel = (typeof ALLOWED_MODELS)[number];

export function isAllowedModel(model: string): model is AllowedModel {
  return (ALLOWED_MODELS as readonly string[]).includes(model);
}

export async function llmFor(userId: string): Promise<LlmChoice> {
  try {
    const own = await loadConnector<LlmCredentials, LlmConfig>(userId, "llm");
    if (own?.credentials.apiKey) {
      const model = own.config.model && isAllowedModel(own.config.model) ? own.config.model : DEFAULT_MODEL;
      return { client: new Anthropic({ apiKey: own.credentials.apiKey }), model, ownKey: true };
    }
  } catch (err) {
    // A broken stored key must not stop the pipeline; fall back to ours.
    console.error(JSON.stringify({ event: "own_llm_load_failed", message: err instanceof Error ? err.message : String(err) }));
  }
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("No LLM key is configured.");
  return { client: new Anthropic(), model: DEFAULT_MODEL, ownKey: false };
}

/** Cheap check that a key works, used before saving it. */
export async function verifyAnthropicKey(apiKey: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const client = new Anthropic({ apiKey, maxRetries: 0 });
    await client.models.list({ limit: 1 });
    return { ok: true };
  } catch (err) {
    const status = (err as { status?: number }).status;
    if (status === 401 || status === 403) return { ok: false, error: "That key was rejected by Anthropic. Check you copied all of it." };
    if (status === 429) return { ok: false, error: "That key is rate limited right now. Try again in a moment." };
    return { ok: false, error: "Couldn't reach Anthropic to check that key. Try again in a moment." };
  }
}
