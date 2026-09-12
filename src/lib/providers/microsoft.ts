import "server-only";
import { saveConnector } from "../connector-store";
import type { MicrosoftConfig, MicrosoftCredentials } from "../connectors";
import { BASE_SCOPES, mergeScopes, personalAccount, scopesToRequest } from "../microsoft-scopes";

/**
 * Microsoft, through one sign-in.
 *
 * Unlike the others, this is not a connector per product. Outlook, Teams,
 * Planner, SharePoint and Excel are all Microsoft Graph behind a single Entra
 * app registration and a single consent, so there is one `microsoft` connector
 * row and the scopes decide what it may touch. Splitting it into five would
 * mean five sign-ins for one account, which is what people actually complain
 * about with Microsoft integrations.
 *
 * Consent is incremental, and that is not a nicety: see microsoft-scopes.ts
 * for why asking for everything at once locks personal accounts out of the
 * whole connector.
 *
 * `offline_access` is what produces a refresh token at all. Without it the
 * connection dies in about an hour and looks like a bug.
 *
 * The `common` authority makes this multi-tenant: personal Microsoft accounts
 * and any company's Entra tenant. Pinning a tenant id here would work for one
 * company and reject every other customer, and it cannot be widened later
 * without re-registering.
 */


const AUTHORITY = "https://login.microsoftonline.com/common/oauth2/v2.0";
const AUTH_URL = `${AUTHORITY}/authorize`;
const TOKEN_URL = `${AUTHORITY}/token`;
export const GRAPH = "https://graph.microsoft.com/v1.0";

export class MicrosoftError extends Error {}
/** The fix is reconnecting, not retrying. */
export class MicrosoftReconnectError extends Error {}

export function microsoftConfigured(): boolean {
  return !!(process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET);
}

function clientCreds() {
  const id = process.env.MICROSOFT_CLIENT_ID;
  const secret = process.env.MICROSOFT_CLIENT_SECRET;
  if (!id || !secret) throw new MicrosoftError("Microsoft sign-in isn't configured on this server.");
  return { id, secret };
}

export function redirectUri(origin: string): string {
  return new URL("/api/connectors/microsoft/callback", origin).toString();
}

/**
 * The consent URL. `add` names one organisation-wide product to ask for on top
 * of the base; without it only the permissions any account can grant alone are
 * requested. See microsoft-scopes.ts for why that split exists.
 */
export function authUrl(origin: string, state: string, add?: string | null): string {
  const { id } = clientCreds();
  const params = new URLSearchParams({
    client_id: id,
    response_type: "code",
    redirect_uri: redirectUri(origin),
    response_mode: "query",
    scope: scopesToRequest(add).join(" "),
    state,
    // Show the consent screen rather than silently reusing a previous grant,
    // so a person reconnecting after an admin widened the permissions
    // actually picks the new ones up.
    prompt: "consent",
  });
  return `${AUTH_URL}?${params}`;
}

type TokenResponse = {
  access_token: string;
  expires_in: number;
  scope?: string;
  token_type: string;
  refresh_token?: string;
  /** Present because `openid` is asked for; read only to tell personal from work. */
  id_token?: string;
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
    throw new MicrosoftError("Couldn't reach Microsoft. Try again in a moment.");
  }

  const json = (await res.json().catch(() => ({}))) as TokenResponse & {
    error?: string;
    error_description?: string;
  };
  if (!res.ok) {
    // invalid_grant on a refresh means the grant is gone for good: revoked in
    // the account, expired by a conditional access policy, or the password
    // changed. Retrying cannot fix any of those.
    if (json.error === "invalid_grant" || json.error === "interaction_required") {
      throw new MicrosoftReconnectError("Your Microsoft connection expired. Reconnect it.");
    }
    if (json.error === "consent_required") {
      throw new MicrosoftReconnectError("Microsoft needs consent for this again. Reconnect it.");
    }
    throw new MicrosoftError(json.error_description?.split("\n")[0] ?? json.error ?? "Microsoft rejected the request.");
  }
  return json;
}

/**
 * Turns a code into tokens.
 *
 * `previous` is what the connection could already do. Consent is incremental,
 * so Microsoft returns only the scopes of the request just made: taking that
 * literally would forget Outlook the moment somebody enabled Teams.
 */
export async function exchangeCode(
  origin: string,
  code: string,
  previous?: string[],
): Promise<{ tokens: TokenResponse; scopes: string[]; personal: boolean }> {
  const { id, secret } = clientCreds();
  const tokens = await tokenRequest(
    new URLSearchParams({
      client_id: id,
      client_secret: secret,
      code,
      redirect_uri: redirectUri(origin),
      grant_type: "authorization_code",
    }),
  );
  if (!tokens.refresh_token) {
    throw new MicrosoftError("Microsoft didn't return a refresh token. Try connecting again.");
  }
  return {
    tokens,
    scopes: mergeScopes(previous, (tokens.scope ?? "").split(" ")),
    personal: personalAccount(tokens.id_token),
  };
}

/**
 * A valid access token, refreshing and re-storing when the cached one is stale.
 *
 * Microsoft rotates the refresh token on every refresh and the old one stops
 * working, so the new one must be stored or the connection breaks on the call
 * after next. Google does not do this; do not copy that branch from there.
 */
export async function accessTokenFor(
  userId: string,
  creds: MicrosoftCredentials,
  config: MicrosoftConfig,
): Promise<string> {
  const stillValid = creds.accessToken && creds.expiresAt && creds.expiresAt - Date.now() > 60_000;
  if (stillValid) return creds.accessToken!;

  const { id, secret } = clientCreds();
  const refreshed = await tokenRequest(
    new URLSearchParams({
      client_id: id,
      client_secret: secret,
      refresh_token: creds.refreshToken,
      grant_type: "refresh_token",
      // What this connection was actually granted, not everything the product
      // can ask for: requesting a scope that was never consented to fails the
      // refresh outright and breaks a working connection.
      scope: [...new Set([...BASE_SCOPES, ...(config.scopes ?? [])])].join(" "),
    }),
  );

  await saveConnector(
    userId,
    "microsoft",
    {
      refreshToken: refreshed.refresh_token ?? creds.refreshToken,
      accessToken: refreshed.access_token,
      expiresAt: Date.now() + refreshed.expires_in * 1000,
    },
    config,
  );
  return refreshed.access_token;
}

/**
 * One Graph call. Anything 401 is a dead grant rather than a bad request, and
 * 403 on Graph almost always means the scope was never consented to, which
 * reconnecting can fix once an admin has approved it.
 */
export async function graph<T>(
  token: string,
  path: string,
  init: {
    method?: string;
    body?: unknown;
    query?: Record<string, string>;
    /** A file's own bytes, for upload endpoints that take content rather than JSON. */
    raw?: string;
    contentType?: string;
  } = {},
): Promise<T> {
  const url = new URL(`${GRAPH}${path}`);
  for (const [k, v] of Object.entries(init.query ?? {})) url.searchParams.set(k, v);

  let res: Response;
  try {
    res = await fetch(url, {
      method: init.method ?? "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        ...(init.raw !== undefined
          ? { "Content-Type": init.contentType ?? "text/plain; charset=utf-8" }
          : init.body === undefined
            ? {}
            : { "Content-Type": "application/json" }),
      },
      body: init.raw !== undefined ? init.raw : init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    throw new MicrosoftError("Couldn't reach Microsoft. Try again in a moment.");
  }

  if (res.status === 401) throw new MicrosoftReconnectError("Your Microsoft connection expired. Reconnect it.");
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const message = readGraphError(text);
    if (res.status === 403) {
      throw new MicrosoftReconnectError(
        `Microsoft refused that: ${message} This usually means the permission was never approved for your organisation.`,
      );
    }
    throw new MicrosoftError(message);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json().catch(() => ({}))) as T;
}

/** Graph wraps its message in `{ error: { code, message } }`. */
export function readGraphError(text: string): string {
  try {
    const parsed = JSON.parse(text) as { error?: { message?: string; code?: string } };
    return parsed.error?.message ?? parsed.error?.code ?? "Microsoft rejected the request.";
  } catch {
    return text.slice(0, 200) || "Microsoft rejected the request.";
  }
}

/** Who connected, for the Settings card. */
export async function whoAmI(token: string): Promise<{ name?: string; email?: string }> {
  const me = await graph<{ displayName?: string; mail?: string; userPrincipalName?: string }>(token, "/me", {
    query: { $select: "displayName,mail,userPrincipalName" },
  });
  return { name: me.displayName, email: me.mail ?? me.userPrincipalName };
}
