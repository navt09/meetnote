import { NextResponse } from "next/server";
import { getAuth } from "@/lib/supabase/server";
import { issueState } from "@/lib/oauth-state";
import { authUrl, slackOAuthConfigured } from "@/lib/providers/slack-oauth";

export const runtime = "nodejs";

/** Begins the Slack install flow, where the user picks the channel. */
export async function GET(req: Request) {
  const auth = await getAuth(req);
  if (!auth) return NextResponse.redirect(new URL("/login?next=/settings", new URL(req.url).origin));
  if (!slackOAuthConfigured()) {
    return NextResponse.json({ error: "Slack isn't configured on this server yet." }, { status: 503 });
  }
  const state = await issueState("slack");
  return NextResponse.redirect(authUrl(new URL(req.url).origin, state));
}
