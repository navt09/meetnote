import "server-only";
import { parseBlocks, type Inline } from "../markdown-lite";
import type { JiraCredentials } from "../connectors";

/**
 * Jira Cloud REST v3 client.
 *
 * The awkward part is the description field: v3 does not take Markdown or plain
 * text, it takes Atlassian Document Format, a nested JSON node tree. Our drafts
 * are Markdown, so markdownToAdf below converts the subset we actually produce.
 */

export class JiraAuthError extends Error {}
export class JiraPermissionError extends Error {}
export class JiraError extends Error {}

function authHeader(creds: JiraCredentials): string {
  return `Basic ${Buffer.from(`${creds.email}:${creds.apiToken}`).toString("base64")}`;
}

type ErrorCollection = { errorMessages?: string[]; errors?: Record<string, string> };

async function call<T>(creds: JiraCredentials, path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${creds.siteUrl}${path}`, {
      ...init,
      headers: {
        Authorization: authHeader(creds),
        Accept: "application/json",
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new JiraError("Couldn't reach Jira. Check the site address and try again.");
  }

  // Jira sends no auth challenge, so a bad header lands here too. The 401 body
  // is not reliably JSON, so branch on status before trying to parse.
  if (res.status === 401) throw new JiraAuthError("Jira rejected those credentials. Check the email and API token.");
  if (res.status === 403) throw new JiraPermissionError("That Jira account doesn't have permission for this.");

  if (res.status === 204) return undefined as T;

  const json = (await res.json().catch(() => ({}))) as T & ErrorCollection;

  if (!res.ok) {
    const fieldErrors = Object.entries(json.errors ?? {}).map(([k, v]) => `${k}: ${v}`);
    const detail = [...(json.errorMessages ?? []), ...fieldErrors].join("; ");
    throw new JiraError(detail || `Jira rejected the request (${res.status}).`);
  }
  return json;
}

// ---- Markdown to Atlassian Document Format ---------------------------------

type AdfMark = { type: "strong" };
type AdfText = { type: "text"; text: string; marks?: AdfMark[] };
type AdfParagraph = { type: "paragraph"; content?: AdfText[] };
type AdfListItem = { type: "listItem"; content: AdfParagraph[] };
type AdfList = { type: "bulletList"; content: AdfListItem[] };
type AdfBlock = AdfParagraph | AdfList;
export type AdfDoc = { version: 1; type: "doc"; content: AdfBlock[] };

/** Text nodes must be non-empty, and bold is a mark on the node rather than a wrapper. */
function inlineToAdf(runs: Inline[]): AdfText[] {
  return runs
    .filter((r) => r.text.length > 0)
    .map((r) => (r.bold ? { type: "text" as const, text: r.text, marks: [{ type: "strong" as const }] } : { type: "text" as const, text: r.text }));
}

/**
 * Converts the Markdown our drafts actually contain (paragraphs, bold, bullet
 * lists) into ADF. Anything unrecognised degrades to a plain paragraph rather
 * than being dropped.
 */
export function markdownToAdf(markdown: string): AdfDoc {
  const content: AdfBlock[] = [];

  for (const block of parseBlocks(markdown)) {
    if (block.type === "bullets") {
      const items = block.items
        .map((item) => inlineToAdf(item))
        .filter((text) => text.length > 0)
        .map((text) => ({ type: "listItem" as const, content: [{ type: "paragraph" as const, content: text }] }));
      if (items.length > 0) content.push({ type: "bulletList", content: items });
    } else {
      const text = inlineToAdf(block.content);
      if (text.length > 0) content.push({ type: "paragraph", content: text });
    }
  }

  // A doc with no content is rejected; give it an empty paragraph instead.
  if (content.length === 0) content.push({ type: "paragraph" });
  return { version: 1, type: "doc", content };
}

// ---- API -------------------------------------------------------------------

export type JiraProject = { id: string; key: string; name: string };

/** Projects this account may actually create issues in, not merely view. */
export async function listProjects(creds: JiraCredentials): Promise<JiraProject[]> {
  const out: JiraProject[] = [];
  let startAt = 0;
  for (let page = 0; page < 10; page++) {
    type Page = { values: JiraProject[]; isLast?: boolean; total?: number };
    let data: Page;
    try {
      data = await call<Page>(creds, `/rest/api/3/project/search?action=create&maxResults=100&startAt=${startAt}`);
    } catch (err) {
      // A 404 here means "nothing matched", not a broken site.
      if (err instanceof JiraError && /404/.test(err.message)) break;
      throw err;
    }
    out.push(...(data.values ?? []).map((p) => ({ id: p.id, key: p.key, name: p.name })));
    if (data.isLast !== false || (data.values ?? []).length === 0) break;
    startAt += data.values.length;
  }
  return out;
}

export type JiraIssueType = { id: string; name: string; subtask: boolean };

/** Issue types actually creatable in a project. Subtasks are excluded: they need a parent. */
export async function listIssueTypes(creds: JiraCredentials, projectKey: string): Promise<JiraIssueType[]> {
  const data = await call<{ issueTypes: JiraIssueType[] }>(
    creds,
    `/rest/api/3/issue/createmeta/${encodeURIComponent(projectKey)}/issuetypes?maxResults=200`,
  );
  return (data.issueTypes ?? []).filter((t) => !t.subtask);
}

export type CreatedIssue = { id: string; key: string; url: string };

export async function createIssue(
  creds: JiraCredentials,
  input: { projectKey: string; summary: string; description: string; issueType: string },
): Promise<CreatedIssue> {
  const data = await call<{ id: string; key: string }>(creds, "/rest/api/3/issue", {
    method: "POST",
    body: JSON.stringify({
      fields: {
        project: { key: input.projectKey },
        summary: input.summary,
        issuetype: { name: input.issueType },
        description: markdownToAdf(input.description),
      },
    }),
  });
  // The API only returns its own URL; the browser one is built from the site.
  return { id: data.id, key: data.key, url: `${creds.siteUrl}/browse/${data.key}` };
}

export async function verify(
  creds: JiraCredentials,
): Promise<{ ok: true; projects: JiraProject[] } | { ok: false; error: string }> {
  try {
    return { ok: true, projects: await listProjects(creds) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Couldn't verify those Jira details." };
  }
}
