import { NextResponse } from "next/server";
import { getAuth } from "@/lib/supabase/server";
import { issueState } from "@/lib/oauth-state";
import { authUrl, jiraOAuthConfigured } from "@/lib/providers/jira-oauth";

export const runtime = "nodejs";

/** Begins the Atlassian consent flow. */
export async function GET(req: Request) {
  const auth = await getAuth(req);
  if (!auth) return NextResponse.redirect(new URL("/login?next=/settings", new URL(req.url).origin));
  if (!jiraOAuthConfigured()) {
    return NextResponse.json({ error: "Jira isn't configured on this server yet." }, { status: 503 });
  }
  const state = await issueState("jira");
  return NextResponse.redirect(authUrl(new URL(req.url).origin, state));
}
