import { NextResponse } from "next/server";
import { isBlocked, requireConnections } from "@/lib/guard";
import { issueState } from "@/lib/oauth-state";
import { authUrl, jiraOAuthConfigured } from "@/lib/providers/jira-oauth";

export const runtime = "nodejs";

/** Begins the Atlassian consent flow. */
export async function GET(req: Request) {
  const gate = await requireConnections(req);
  if (isBlocked(gate)) return gate;
  const { auth } = gate;
  if (!auth) return NextResponse.redirect(new URL("/login?next=/settings", new URL(req.url).origin));
  if (!jiraOAuthConfigured()) {
    return NextResponse.json({ error: "Jira isn't configured on this server yet." }, { status: 503 });
  }
  const state = await issueState("jira");
  return NextResponse.redirect(authUrl(new URL(req.url).origin, state));
}
