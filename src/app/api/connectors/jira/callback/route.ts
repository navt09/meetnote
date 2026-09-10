import { NextResponse } from "next/server";
import { getAuth } from "@/lib/supabase/server";
import { saveConnector } from "@/lib/connector-store";
import { backToSettings, consumeState } from "@/lib/oauth-state";
import { exchangeCode } from "@/lib/providers/jira-oauth";
import { listProjects } from "@/lib/providers/jira";
import type { JiraConfig, JiraCredentials } from "@/lib/connectors";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Where Atlassian sends the user back. Stores the token and resolves the site. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const origin = url.origin;

  const auth = await getAuth(req);
  if (!auth) return NextResponse.redirect(new URL("/login?next=/settings", origin));

  if (!(await consumeState("jira", url.searchParams.get("state")))) {
    return NextResponse.redirect(backToSettings(origin, { error: "jira_expired" }));
  }

  const denied = url.searchParams.get("error");
  if (denied) {
    console.error(JSON.stringify({ event: "jira_denied", reason: denied.slice(0, 100) }));
    return NextResponse.redirect(backToSettings(origin, { error: denied === "access_denied" ? "jira_declined" : "jira_provider_error" }));
  }

  const code = url.searchParams.get("code");
  if (!code) return NextResponse.redirect(backToSettings(origin, { error: "jira_no_code" }));

  try {
    const { accessToken, refreshToken, expiresAt, sites } = await exchangeCode(origin, code);

    // Consent can legitimately grant zero sites if the user picked none.
    if (sites.length === 0) {
      return NextResponse.redirect(backToSettings(origin, { error: "jira_no_site" }));
    }
    const site = sites[0];

    const credentials: JiraCredentials = {
      oauth: true,
      accessToken,
      refreshToken,
      expiresAt,
      cloudId: site.id,
      // Kept because only the site address can build a clickable issue link.
      siteUrl: site.url,
    };

    // One project means no second step for the common case.
    let config: JiraConfig = { siteUrl: site.url };
    try {
      const projects = await listProjects(credentials);
      if (projects.length === 1) {
        config = { siteUrl: site.url, projectKey: projects[0].key, projectName: projects[0].name, issueType: "Task" };
      }
    } catch {
      // A project lookup failure shouldn't lose the connection; they can pick later.
    }

    await saveConnector(auth.user.id, "jira", credentials, config);
    // The project name is shown from the stored config once the page loads.
    return NextResponse.redirect(backToSettings(origin, { notice: config.projectKey ? "jira_connected" : "jira_pick" }));
  } catch (err) {
    // Atlassian's own wording stays in the log; the page shows a fixed sentence.
    console.error(JSON.stringify({ event: "jira_callback_error", message: err instanceof Error ? err.message : String(err) }));
    return NextResponse.redirect(backToSettings(origin, { error: "jira_failed" }));
  }
}
