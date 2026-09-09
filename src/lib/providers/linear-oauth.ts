import "server-only";
import { saveConnector } from "../connector-store";
import type { LinearConfig, LinearCredentials } from "../connectors";

/**
 * Linear OAuth, so a customer presses Connect instead of pasting an API key.
 *
 * Three things here differ from most OAuth providers and from Linear's own
 * personal-key flow, all verified against current docs:
 *  - scopes are COMMA separated on the way out, and space separated on the way back
 *  - an OAuth access token DOES use the "Bearer " prefix, unlike a personal key
 *  - refresh tokens rotate: every refresh returns a new one that must replace
 *    the stored one, and access tokens only last 24 hours
 */

const AUTHORIZE_URL = "https://linear.app/oauth/authorize";
const TOKEN_URL = "https://api.linear.app/oauth/token";
const REVOKE_URL = "https://api.linear.app/oauth/revoke";

/** Read covers listing teams; issues:create is the narrowest write we need. */
export const LINEAR_SCOPES = ["read", "issues:create"];

export class LinearOAuthError extends Error {}
export class LinearReconnectError extends Error {}

export function linearOAuthConfigured(): boolean {
  return !!(process.env.LINEAR_CLIENT_ID && process.env.LINEAR_CLIENT_SECRET);
}

function clientCreds() {
  const id = process.env.LINEAR_CLIENT_ID;
  const secret = process.env.LINEAR_CLIENT_SECRET;
  if (!id || !secret) throw new LinearOAuthError("Linear sign-in isn't configured on this server.");
  return { id, secret };
}

export function redirectUri(origin: string): string {
  return new URL("/api/connectors/linear/callback", origin).toString();
}

export function authUrl(origin: string, state: string): string {
  const { id } = clientCreds();
  const params = new URLSearchParams({
    client_id: id,
    redirect_uri: redirectUri(origin),
    response_type: "code",
    // Comma separated. Spaces, the RFC default, silently fail here.
    scope: LINEAR_SCOPES.join(","),
    state,
  });
  return `${AUTHORIZE_URL}?${params}`;
}

type TokenResponse = {
  access_token: string;
  token_type: string;
  expires_in: number;
  // Space separated on the way back. Apps registered before Dec 2023 send an array.
  scope: string | string[];
  refresh_token: string;
};

async function tokenRequest(body: URLSearchParams): Promise<TokenResponse> {
  let res: Response;
  try {
    res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new LinearOAuthError("Couldn't reach Linear. Try again in a moment.");
  }

  const json = (await res.json().catch(() => ({}))) as TokenResponse & { error?: string; error_description?: string };
  if (!res.ok) {
    if (res.status === 400 || res.status === 401) {
      throw new LinearReconnectError("That Linear connection is no longer valid. Reconnect it.");
    }
    throw new LinearOAuthError(json.error_description ?? json.error ?? "Linear rejected the request.");
  }
  return json;
}

export function scopeList(scope: string | string[]): string[] {
  return Array.isArray(scope) ? scope : scope.split(" ").filter(Boolean);
}

export async function exchangeCode(origin: string, code: string): Promise<{ credentials: LinearCredentials; scopes: string[] }> {
  const { id, secret } = clientCreds();
  const tokens = await tokenRequest(
    new URLSearchParams({
      code,
      redirect_uri: redirectUri(origin),
      client_id: id,
      client_secret: secret,
      grant_type: "authorization_code",
    }),
  );
  return {
    credentials: {
      apiKey: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: Date.now() + tokens.expires_in * 1000,
      oauth: true,
    },
    scopes: scopeList(tokens.scope),
  };
}

/**
 * A valid access token, refreshing when the stored one is near expiry.
 *
 * Linear rotates refresh tokens, so the new one is written back every time. A
 * refresh that fails on the network can be retried with the same old token for
 * 30 minutes, so a transient failure is not treated as a dead connection.
 */
export async function accessTokenFor(userId: string, creds: LinearCredentials, config: LinearConfig): Promise<string> {
  if (!creds.oauth || !creds.refreshToken) return creds.apiKey; // a pasted personal key
  const fresh = creds.expiresAt && creds.expiresAt - Date.now() > 5 * 60_000;
  if (fresh) return creds.apiKey;

  const { id, secret } = clientCreds();
  const tokens = await tokenRequest(
    new URLSearchParams({ refresh_token: creds.refreshToken, grant_type: "refresh_token", client_id: id, client_secret: secret }),
  );

  await saveConnector(
    userId,
    "linear",
    { apiKey: tokens.access_token, refreshToken: tokens.refresh_token, expiresAt: Date.now() + tokens.expires_in * 1000, oauth: true },
    config,
  );
  return tokens.access_token;
}

export async function revoke(token: string): Promise<void> {
  try {
    await fetch(REVOKE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token, token_type_hint: "access_token" }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    // Disconnecting locally still matters even if Linear can't be reached.
  }
}
