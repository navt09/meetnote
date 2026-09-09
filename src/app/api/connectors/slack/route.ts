import { NextResponse } from "next/server";
import { getAuth } from "@/lib/supabase/server";
import { saveConnector } from "@/lib/connector-store";
import { credentialsKeyConfigured } from "@/lib/crypto";
import { verify } from "@/lib/providers/slack";
import { isValidSlackWebhook, type SlackConfig, type SlackCredentials } from "@/lib/connectors";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Saves a Slack incoming webhook, after posting a hello to prove it works. */
export async function POST(req: Request) {
  const auth = await getAuth(req);
  if (!auth) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  if (!credentialsKeyConfigured()) {
    return NextResponse.json({ error: "Credential storage isn't configured on the server yet." }, { status: 503 });
  }

  let body: { webhookUrl?: string; channelName?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const webhookUrl = (body.webhookUrl ?? "").trim();
  // Only hooks.slack.com, so a mistyped or hostile URL can't be used to make
  // this server post arbitrary requests somewhere else.
  if (!isValidSlackWebhook(webhookUrl)) {
    return NextResponse.json({ error: "That doesn't look like a Slack webhook URL. It starts https://hooks.slack.com/services/" }, { status: 400 });
  }

  const result = await verify({ webhookUrl });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });

  const config: SlackConfig = { channelName: (body.channelName ?? "").trim().slice(0, 80) || undefined };
  try {
    await saveConnector(auth.user.id, "slack", { webhookUrl } satisfies SlackCredentials, config);
  } catch (err) {
    console.error(JSON.stringify({ event: "slack_save_error", message: err instanceof Error ? err.message : String(err) }));
    return NextResponse.json({ error: "Could not save that webhook. Try again." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, config });
}
