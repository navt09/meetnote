import { NextResponse } from "next/server";
import { getAuth } from "@/lib/supabase/server";
import { saveConnector } from "@/lib/connector-store";
import { backToSettings, consumeState } from "@/lib/oauth-state";
import { exchangeCode } from "@/lib/providers/slack-oauth";
import type { SlackConfig } from "@/lib/connectors";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Where Slack sends the user back after they pick a channel. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const origin = url.origin;

  const auth = await getAuth(req);
  if (!auth) return NextResponse.redirect(new URL("/login?next=/settings", origin));

  if (!(await consumeState("slack", url.searchParams.get("state")))) {
    return NextResponse.redirect(backToSettings(origin, { error: "slack_expired" }));
  }

  const denied = url.searchParams.get("error");
  if (denied) {
    console.error(JSON.stringify({ event: "slack_denied", reason: denied.slice(0, 100) }));
    return NextResponse.redirect(backToSettings(origin, { error: denied === "access_denied" ? "slack_declined" : "slack_provider_error" }));
  }

  const code = url.searchParams.get("code");
  if (!code) return NextResponse.redirect(backToSettings(origin, { error: "slack_no_code" }));

  try {
    const { credentials, channelName } = await exchangeCode(origin, code);
    await saveConnector(auth.user.id, "slack", credentials, { channelName } satisfies SlackConfig);
    // The channel name is shown from the stored config once the page loads.
    return NextResponse.redirect(backToSettings(origin, { notice: "slack_connected" }));
  } catch (err) {
    // Slack's own wording stays in the log; the page shows a fixed sentence.
    console.error(JSON.stringify({ event: "slack_callback_error", message: err instanceof Error ? err.message : String(err) }));
    return NextResponse.redirect(backToSettings(origin, { error: "slack_failed" }));
  }
}
