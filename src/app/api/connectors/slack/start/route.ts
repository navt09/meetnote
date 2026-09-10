import { NextResponse } from "next/server";
import { isBlocked, requireConnections } from "@/lib/guard";
import { issueState } from "@/lib/oauth-state";
import { authUrl, slackOAuthConfigured } from "@/lib/providers/slack-oauth";

export const runtime = "nodejs";

/** Begins the Slack install flow, where the user picks the channel. */
export async function GET(req: Request) {
  const gate = await requireConnections(req);
  if (isBlocked(gate)) return gate;
  const { auth } = gate;
  if (!auth) return NextResponse.redirect(new URL("/login?next=/settings", new URL(req.url).origin));
  if (!slackOAuthConfigured()) {
    return NextResponse.json({ error: "Slack isn't configured on this server yet." }, { status: 503 });
  }
  const state = await issueState("slack");
  return NextResponse.redirect(authUrl(new URL(req.url).origin, state));
}
