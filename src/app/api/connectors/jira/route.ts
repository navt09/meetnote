import { NextResponse } from "next/server";
import { getAuth } from "@/lib/supabase/server";
import { loadConnector, saveConnector, updateConnectorConfig } from "@/lib/connector-store";
import { credentialsKeyConfigured } from "@/lib/crypto";
import { listIssueTypes, verify } from "@/lib/providers/jira";
import { normaliseJiraSite, type JiraConfig, type JiraCredentials } from "@/lib/connectors";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  const auth = await getAuth(req);
  if (!auth) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  if (!credentialsKeyConfigured()) {
    return NextResponse.json({ error: "Credential storage isn't configured on the server yet." }, { status: 503 });
  }

  let body: { siteUrl?: string; email?: string; apiToken?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const siteUrl = normaliseJiraSite(body.siteUrl ?? "");
  if (!siteUrl) return NextResponse.json({ error: "Enter your Jira site, like acme.atlassian.net" }, { status: 400 });
  const email = (body.email ?? "").trim();
  if (!email.includes("@")) return NextResponse.json({ error: "Enter the email you log in to Jira with." }, { status: 400 });
  const apiToken = (body.apiToken ?? "").trim();
  if (!apiToken) return NextResponse.json({ error: "Paste your Jira API token." }, { status: 400 });

  const creds: JiraCredentials = { siteUrl, email, apiToken };
  const result = await verify(creds);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  if (result.projects.length === 0) {
    return NextResponse.json({ error: "Those details work, but the account can't create issues in any project." }, { status: 400 });
  }

  const only = result.projects.length === 1 ? result.projects[0] : null;
  const config: JiraConfig = only
    ? { siteUrl, projectKey: only.key, projectName: only.name, issueType: "Task" }
    : { siteUrl };

  try {
    await saveConnector(auth.user.id, "jira", creds, config);
  } catch (err) {
    console.error(JSON.stringify({ event: "jira_save_error", message: err instanceof Error ? err.message : String(err) }));
    return NextResponse.json({ error: "Could not save those details. Try again." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, projects: result.projects, config });
}

/** Choose the project (and issue type) new issues go into. */
export async function PATCH(req: Request) {
  const auth = await getAuth(req);
  if (!auth) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  let body: { projectKey?: string; issueType?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const projectKey = (body.projectKey ?? "").trim();
  if (!projectKey) return NextResponse.json({ error: "Pick a project." }, { status: 400 });

  const stored = await loadConnector<JiraCredentials, JiraConfig>(auth.user.id, "jira");
  if (!stored) return NextResponse.json({ error: "Connect Jira first." }, { status: 400 });

  const result = await verify(stored.credentials);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  const project = result.projects.find((p) => p.key === projectKey);
  if (!project) return NextResponse.json({ error: "That project isn't one this account can create issues in." }, { status: 400 });

  // Validate the issue type against what the project actually offers.
  let issueType = (body.issueType ?? "").trim();
  try {
    const types = await listIssueTypes(stored.credentials, project.key);
    if (types.length === 0) return NextResponse.json({ error: "That project has no issue types we can create." }, { status: 400 });
    const match = types.find((t) => t.name.toLowerCase() === issueType.toLowerCase());
    issueType = match?.name ?? types.find((t) => t.name === "Task")?.name ?? types[0].name;
  } catch {
    issueType = issueType || "Task";
  }

  const config: JiraConfig = { siteUrl: stored.credentials.siteUrl, projectKey: project.key, projectName: project.name, issueType };
  await updateConnectorConfig(auth.user.id, "jira", config);
  return NextResponse.json({ ok: true, config });
}

/** Projects and issue types for the pickers. */
export async function GET(req: Request) {
  const auth = await getAuth(req);
  if (!auth) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const stored = await loadConnector<JiraCredentials, JiraConfig>(auth.user.id, "jira");
  if (!stored) return NextResponse.json({ error: "Connect Jira first." }, { status: 404 });

  const result = await verify(stored.credentials);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });

  let issueTypes: string[] = [];
  if (stored.config.projectKey) {
    try {
      issueTypes = (await listIssueTypes(stored.credentials, stored.config.projectKey)).map((t) => t.name);
    } catch {
      issueTypes = [];
    }
  }
  return NextResponse.json({ projects: result.projects, issueTypes, config: stored.config });
}
