import { NextResponse } from "next/server";
import { getAuth } from "@/lib/supabase/server";
import { saveConnector } from "@/lib/connector-store";
import { credentialsKeyConfigured, maskSecret } from "@/lib/crypto";
import { DEFAULT_MODEL, isAllowedModel, verifyAnthropicKey } from "@/lib/llm";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Store a customer's own Anthropic key, after checking it actually works. */
export async function POST(req: Request) {
  const auth = await getAuth(req);
  if (!auth) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  if (!credentialsKeyConfigured()) {
    return NextResponse.json({ error: "Credential storage isn't configured on the server yet." }, { status: 503 });
  }

  let body: { apiKey?: string; model?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const apiKey = (body.apiKey ?? "").trim();
  if (!apiKey) return NextResponse.json({ error: "Paste your Anthropic key." }, { status: 400 });

  const model = (body.model ?? DEFAULT_MODEL).trim();
  if (!isAllowedModel(model)) return NextResponse.json({ error: "Pick one of the offered models." }, { status: 400 });

  const check = await verifyAnthropicKey(apiKey);
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 });

  try {
    await saveConnector(auth.user.id, "llm", { apiKey }, { model, keyHint: maskSecret(apiKey) });
  } catch (err) {
    console.error(JSON.stringify({ event: "llm_save_error", message: err instanceof Error ? err.message : String(err) }));
    return NextResponse.json({ error: "Could not save that key. Try again." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, config: { model, keyHint: maskSecret(apiKey) } });
}
