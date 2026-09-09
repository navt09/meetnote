import "server-only";
import type { LinearCredentials } from "../connectors";

/**
 * Linear GraphQL client.
 *
 * Two things worth knowing, both verified against the live API:
 *  - A personal API key goes in Authorization RAW, with no "Bearer " prefix.
 *    Adding the prefix fails with exactly the same 401 as a revoked key, so
 *    getting it wrong looks like a bad key rather than a bad header.
 *  - A 200 does not mean success. GraphQL returns errors in the body, so the
 *    errors array is checked on every response regardless of status.
 */

const ENDPOINT = "https://api.linear.app/graphql";

type GraphQLError = {
  message: string;
  extensions?: { code?: string; userPresentableMessage?: string };
};
type GraphQLResponse<T> = { data?: T; errors?: GraphQLError[] };

export class LinearAuthError extends Error {}
export class LinearError extends Error {}

/**
 * The two credential types need different headers, and getting it wrong looks
 * identical to a revoked key: a pasted personal key goes in raw, an OAuth
 * access token needs "Bearer ".
 */
export function authHeaderFor(creds: LinearCredentials): string {
  return creds.oauth ? `Bearer ${creds.apiKey}` : creds.apiKey;
}

async function gql<T>(authHeader: string, query: string, variables?: Record<string, unknown>): Promise<T> {
  let res: Response;
  try {
    res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { Authorization: authHeader, "Content-Type": "application/json" },
      body: JSON.stringify({ query, variables }),
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new LinearError("Couldn't reach Linear. Try again in a moment.");
  }

  const json = (await res.json().catch(() => ({}))) as GraphQLResponse<T>;
  const first = json.errors?.[0];

  if (res.status === 401 || first?.extensions?.code === "AUTHENTICATION_ERROR") {
    throw new LinearAuthError("Linear rejected that API key. It may have been revoked, or copied incompletely.");
  }
  if (first?.extensions?.code === "RATELIMITED") {
    throw new LinearError("Linear is rate limiting us right now. Try again shortly.");
  }
  if (first) {
    throw new LinearError(first.extensions?.userPresentableMessage ?? first.message ?? "Linear rejected the request.");
  }
  if (!res.ok || !json.data) throw new LinearError(`Linear returned an unexpected response (${res.status}).`);
  return json.data;
}

export type LinearTeam = { id: string; name: string };

/** Teams this key can see. Used to let a person choose where issues land. */
export async function listTeams(creds: LinearCredentials): Promise<LinearTeam[]> {
  const data = await gql<{ teams: { nodes: LinearTeam[] } }>(
    authHeaderFor(creds),
    `query Teams { teams(first: 100) { nodes { id name } } }`,
  );
  return data.teams.nodes;
}

export type CreatedIssue = { id: string; identifier: string; url: string; title: string };

/**
 * Creates an issue. The description is sent as a GraphQL variable rather than
 * interpolated into the query, which avoids every escaping problem with
 * multi-line Markdown and closes an injection hole. Linear takes Markdown as-is.
 */
export async function createIssue(
  creds: LinearCredentials,
  input: { teamId: string; title: string; description: string },
): Promise<CreatedIssue> {
  const data = await gql<{ issueCreate: { success: boolean; issue: CreatedIssue | null } }>(
    authHeaderFor(creds),
    `mutation IssueCreate($input: IssueCreateInput!) {
       issueCreate(input: $input) {
         success
         issue { id identifier title url }
       }
     }`,
    { input },
  );

  // The schema marks `issue` nullable even when success is true, so both are checked.
  if (!data.issueCreate.success || !data.issueCreate.issue) {
    throw new LinearError("Linear accepted the request but didn't return the new issue.");
  }
  return data.issueCreate.issue;
}

/** Confirms a key works and returns the teams, for the settings page. */
export async function verify(creds: LinearCredentials): Promise<{ ok: true; teams: LinearTeam[] } | { ok: false; error: string }> {
  try {
    return { ok: true, teams: await listTeams(creds) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Couldn't verify that Linear key." };
  }
}
