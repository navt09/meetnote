import "server-only";
import { saveConnector } from "../connector-store";
import type { JiraConfig, JiraCredentials } from "../connectors";

/**
 * Atlassian OAuth 2.0 (3LO), so a customer presses Connect instead of pasting
 * a site address, email and API token.
 *
 * Two traps, both verified against current docs:
 *  - Refresh tokens ROTATE. Every refresh returns a new one and immediately
 *    kills the old. Code that keeps the original (as Google's flow allows)
 *    works exactly once and then breaks for good.
 *  - The token is not tied to a site. After connecting you must ask which
 *    sites it can reach, then talk to api.atlassian.com/ex/jira/<cloudId>
 *    rather than the customer's own domain.
 */

const AUTHORIZE_URL = "https://auth.atlassian.com/authorize";
const TOKEN_URL = "https://auth.atlassian.com/oauth/token";
const RESOURCES_URL = "https://api.atlassian.com/oauth/token/accessible-resources";

/** Classic scopes. The granular ones are still beta, and Atlassian advises against them. */
export const JIRA_SCOPES = ["read:jira-work", "write:jira-work", "read:jira-user", "offline_access"];

export class JiraOAuthError extends Error {}
export class JiraReconnectError extends Error {}

export function jiraOAuthConfigured(): boolean {
  return !!(process.env.JIRA_CLIENT_ID && process.env.JIRA_CLIENT_SECRET);
}

function clientCreds() {
  const id = process.env.JIRA_CLIENT_ID;
  const secret = process.env.JIRA_CLIENT_SECRET;
  if (!id || !secret) throw new JiraOAuthError("Jira sign-in isn't configured on this server.");
  return { id, secret };
}

export function redirectUri(origin: string): string {
  return new URL("/api/connectors/jira/callback", origin).toString();
}

export function authUrl(origin: string, state: string): string {
  const { id } = clientCreds();
  const params = new URLSearchParams({
    // A literal constant, not the customer's own domain.
    audience: "api.atlassian.com",
    client_id: id,
    scope: JIRA_SCOPES.join(" "),
    redirect_uri: redirectUri(origin),
    state,
    response_type: "code",
    // Documented as required; it is also what guarantees a refresh token.
    prompt: "consent",
  });
  return `${AUTHORIZE_URL}?${params}`;
}

type TokenResponse = { access_token: string; expires_in: number; scope: string; refresh_token?: string };

async function tokenRequest(body: Record<string, string>): Promise<TokenResponse> {
  let res: Response;
  try {
    res = await fetch(TOKEN_URL, {
      method: "POST",
      // Atlassian takes JSON here, unlike most OAuth token endpoints.
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new JiraOAuthError("Couldn't reach Atlassian. Try again in a moment.");
  }

  const json = (await res.json().catch(() => ({}))) as TokenResponse & { error?: string; error_description?: string };
  if (!res.ok) {
    // 403 invalid_grant at the token endpoint means the grant is gone: expired,
    // already rotated, or revoked. Reconnecting is the only fix.
    if (res.status === 403 || json.error === "invalid_grant") {
      throw new JiraReconnectError("That Jira connection is no longer valid. Reconnect it.");
    }
    throw new JiraOAuthError(json.error_description ?? json.error ?? "Atlassian rejected the request.");
  }
  return json;
}

export type AccessibleSite = { id: string; name: string; url: string; scopes: string[] };

/** Which Jira sites this token can reach. Can legitimately be empty. */
export async function accessibleSites(accessToken: string): Promise<AccessibleSite[]> {
  const res = await fetch(RESOURCES_URL, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
    signal: AbortSignal.timeout(20_000),
  });
  if (res.status === 401) throw new JiraReconnectError("Atlassian rejected the saved credentials. Reconnect Jira.");
  if (!res.ok) throw new JiraOAuthError(`Couldn't list your Jira sites (${res.status}).`);
  return (await res.json()) as AccessibleSite[];
}

export async function exchangeCode(
  origin: string,
  code: string,
): Promise<{ accessToken: string; refreshToken: string; expiresAt: number; sites: AccessibleSite[] }> {
  const { id, secret } = clientCreds();
  const tokens = await tokenRequest({
    grant_type: "authorization_code",
    client_id: id,
    client_secret: secret,
    code,
    redirect_uri: redirectUri(origin),
  });
  if (!tokens.refresh_token) {
    throw new JiraOAuthError("Atlassian didn't return a refresh token. Try connecting again.");
  }
  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt: Date.now() + tokens.expires_in * 1000,
    sites: await accessibleSites(tokens.access_token),
  };
}

/**
 * A valid access token, refreshing when needed and storing the rotated refresh
 * token in the same write. Losing that new value would break the connection
 * permanently after one cycle.
 */
export async function accessTokenFor(userId: string, creds: JiraCredentials, config: JiraConfig): Promise<JiraCredentials> {
  if (!creds.oauth) return creds;
  const fresh = creds.expiresAt && creds.expiresAt - Date.now() > 5 * 60_000;
  if (fresh && creds.accessToken) return creds;
  if (!creds.refreshToken) throw new JiraReconnectError("That Jira connection is missing its refresh token. Reconnect it.");

  const { id, secret } = clientCreds();
  const tokens = await tokenRequest({
    grant_type: "refresh_token",
    client_id: id,
    client_secret: secret,
    refresh_token: creds.refreshToken,
  });

  const updated: JiraCredentials = {
    ...creds,
    accessToken: tokens.access_token,
    // Rotated: the token just used is already dead.
    refreshToken: tokens.refresh_token ?? creds.refreshToken,
    expiresAt: Date.now() + tokens.expires_in * 1000,
  };
  await saveConnector(userId, "jira", updated, config);
  return updated;
}
