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
    return NextResponse.redirect(backToSettings(origin, { error: "That Slack connection attempt expired. Try again." }));
  }

  const denied = url.searchParams.get("error");
  if (denied) {
    return NextResponse.redirect(
      backToSettings(origin, { error: denied === "access_denied" ? "You declined the Slack permissions." : "Slack reported a problem." }),
    );
  }

  const code = url.searchParams.get("code");
  if (!code) return NextResponse.redirect(backToSettings(origin, { error: "Slack didn't return an authorisation code." }));

  try {
    const { credentials, channelName } = await exchangeCode(origin, code);
    await saveConnector(auth.user.id, "slack", credentials, { channelName } satisfies SlackConfig);
    return NextResponse.redirect(backToSettings(origin, { notice: `Slack connected. Summaries will post to ${channelName}.` }));
  } catch (err) {
    console.error(JSON.stringify({ event: "slack_callback_error", message: err instanceof Error ? err.message : String(err) }));
    return NextResponse.redirect(backToSettings(origin, { error: err instanceof Error ? err.message : "Couldn't finish connecting Slack." }));
  }
}
