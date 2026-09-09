import "server-only";
import { saveConnector } from "../connector-store";
import type { GoogleConfig, GoogleCredentials } from "../connectors";

/**
 * Google OAuth for two narrow jobs: send an email as the user, and read their
 * upcoming calendar events.
 *
 * Scope choice matters commercially. Both scopes here are *sensitive*: they need
 * Google's app verification before more than 100 people can connect, but not the
 * annual paid third-party security assessment.
 *
 * Every broader Gmail scope (compose, modify, readonly) is *restricted* and does
 * trigger that assessment. No Calendar scope is restricted, so calendar.events
 * costs nothing extra. Do not widen the Gmail one.
 *
 * Connections expiring after 7 days is not a bug: it is what Google does to OAuth
 * apps left in "Testing" publishing status. See PLAN.md for the fix.
 */

export const SCOPE_GMAIL_SEND = "https://www.googleapis.com/auth/gmail.send";
/** Read and write events. Replaces the old read-only scope so tasks can be blocked out. */
export const SCOPE_CALENDAR_WRITE = "https://www.googleapis.com/auth/calendar.events";

export const SCOPES = [SCOPE_GMAIL_SEND, SCOPE_CALENDAR_WRITE] as const;

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

export class GoogleAuthError extends Error {}
export class GoogleReconnectError extends Error {}
export class GoogleError extends Error {}

export function googleConfigured(): boolean {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

function clientCreds() {
  const id = process.env.GOOGLE_CLIENT_ID;
  const secret = process.env.GOOGLE_CLIENT_SECRET;
  if (!id || !secret) throw new GoogleError("Google sign-in isn't configured on this server.");
  return { id, secret };
}

export function redirectUri(origin: string): string {
  return new URL("/api/connectors/google/callback", origin).toString();
}

/**
 * The consent URL. Two params are load-bearing:
 *  - access_type=offline, without which no refresh token is ever issued
 *  - prompt=consent, because Google only returns a refresh token on the FIRST
 *    consent unless you force the screen again
 */
export function authUrl(origin: string, state: string): string {
  const { id } = clientCreds();
  const params = new URLSearchParams({
    client_id: id,
    redirect_uri: redirectUri(origin),
    response_type: "code",
    scope: SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `${AUTH_URL}?${params}`;
}

type TokenResponse = {
  access_token: string;
  expires_in: number;
  scope: string;
  token_type: string;
  refresh_token?: string;
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
    throw new GoogleError("Couldn't reach Google. Try again in a moment.");
  }

  const json = (await res.json().catch(() => ({}))) as TokenResponse & { error?: string; error_description?: string };
  if (!res.ok) {
    // invalid_grant on a refresh means the grant is gone for good: revoked,
    // six months idle, a Gmail password change, or a test-mode 7-day expiry.
    if (json.error === "invalid_grant") throw new GoogleReconnectError("Your Google connection expired. Reconnect it.");
    if (json.error === "admin_policy_enforced") {
      throw new GoogleReconnectError("A Google Workspace admin has blocked this access. Reconnecting won't help; ask your admin.");
    }
    throw new GoogleError(json.error_description ?? json.error ?? "Google rejected the request.");
  }
  return json;
}

export async function exchangeCode(origin: string, code: string): Promise<{ tokens: TokenResponse; scopes: string[] }> {
  const { id, secret } = clientCreds();
  const tokens = await tokenRequest(
    new URLSearchParams({ code, client_id: id, client_secret: secret, redirect_uri: redirectUri(origin), grant_type: "authorization_code" }),
  );
  if (!tokens.refresh_token) {
    throw new GoogleError("Google didn't return a refresh token. Disconnect the app in your Google account settings, then try again.");
  }
  // Granular consent lets a person untick individual scopes, so check rather than assume.
  const granted = (tokens.scope ?? "").split(" ").filter(Boolean);
  return { tokens, scopes: granted };
}

export function hasScope(scopes: string[], scope: string): boolean {
  return scopes.includes(scope);
}

/** A valid access token, refreshing and re-storing when the cached one is stale. */
export async function accessTokenFor(
  userId: string,
  creds: GoogleCredentials,
  config: GoogleConfig,
): Promise<string> {
  const stillValid = creds.accessToken && creds.expiresAt && creds.expiresAt - Date.now() > 60_000;
  if (stillValid) return creds.accessToken!;

  const { id, secret } = clientCreds();
  const refreshed = await tokenRequest(
    new URLSearchParams({ client_id: id, client_secret: secret, refresh_token: creds.refreshToken, grant_type: "refresh_token" }),
  );

  // Google does not return a new refresh token here; keep the stored one.
  await saveConnector(
    userId,
    "google",
    { refreshToken: creds.refreshToken, accessToken: refreshed.access_token, expiresAt: Date.now() + refreshed.expires_in * 1000 },
    config,
  );
  return refreshed.access_token;
}

async function googleFetch(token: string, url: string, init: RequestInit = {}): Promise<Response> {
  return fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(20_000),
  });
}

/** base64url, and RFC 2822 needs CRLF between headers. */
function encodeMessage(to: string, subject: string, body: string): string {
  const headers = [
    `To: ${to}`,
    // Non-ASCII subjects need RFC 2047 encoding rather than raw UTF-8.
    `Subject: ${/^[\x20-\x7E]*$/.test(subject) ? subject : `=?UTF-8?B?${Buffer.from(subject, "utf8").toString("base64")}?=`}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "MIME-Version: 1.0",
  ].join("\r\n");
  return Buffer.from(`${headers}\r\n\r\n${body}`, "utf8").toString("base64url");
}

export async function sendEmail(
  userId: string,
  creds: GoogleCredentials,
  config: GoogleConfig,
  message: { to: string; subject: string; body: string },
): Promise<{ id: string }> {
  const token = await accessTokenFor(userId, creds, config);
  const res = await googleFetch(token, "https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ raw: encodeMessage(message.to, message.subject, message.body) }),
  });

  if (res.status === 401) throw new GoogleReconnectError("Google rejected the saved credentials. Reconnect Google.");
  if (res.status === 403) {
    const body = (await res.text().catch(() => "")).slice(0, 200);
    if (/insufficientPermissions|insufficient authentication scopes/i.test(body)) {
      throw new GoogleReconnectError("Meetnote wasn't granted permission to send email. Reconnect Google and allow sending.");
    }
    throw new GoogleError("Google refused to send that email.");
  }
  if (!res.ok) throw new GoogleError(`Gmail rejected the message (${res.status}).`);

  const json = (await res.json()) as { id: string };
  return { id: json.id };
}

export type NewEvent = {
  title: string;
  /** ISO 8601 with an offset, e.g. 2026-09-15T14:00:00Z. */
  start: string;
  end: string;
  description?: string;
  attendees?: string[];
  /** Whether Google emails the attendees. Default is to stay quiet. */
  notify?: boolean;
};

export type CreatedEvent = { id: string; url: string; title: string; start: string };

/**
 * Puts an event on the user's primary calendar.
 *
 * sendUpdates defaults to "none" so approving a draft never silently emails a
 * roomful of people; the caller opts in.
 */
export async function createEvent(
  userId: string,
  creds: GoogleCredentials,
  config: GoogleConfig,
  event: NewEvent,
): Promise<CreatedEvent> {
  const token = await accessTokenFor(userId, creds, config);
  const params = new URLSearchParams({ sendUpdates: event.notify ? "all" : "none" });

  const res = await googleFetch(token, `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      summary: event.title,
      description: event.description,
      start: { dateTime: event.start },
      end: { dateTime: event.end },
      attendees: (event.attendees ?? []).filter((a) => a.includes("@")).map((email) => ({ email })),
    }),
  });

  if (res.status === 401) throw new GoogleReconnectError("Google rejected the saved credentials. Reconnect Google.");
  if (res.status === 403) {
    const body = (await res.text().catch(() => "")).slice(0, 300);
    if (/insufficientPermissions|insufficient authentication scopes/i.test(body)) {
      throw new GoogleReconnectError("Meetnote wasn't granted permission to add calendar events. Reconnect Google and allow it.");
    }
    throw new GoogleError("Google refused to create that event.");
  }
  if (!res.ok) throw new GoogleError(`Calendar rejected the event (${res.status}).`);

  const json = (await res.json()) as { id: string; htmlLink?: string; summary?: string; start?: { dateTime?: string; date?: string } };
  return {
    id: json.id,
    url: json.htmlLink ?? "https://calendar.google.com/",
    title: json.summary ?? event.title,
    start: json.start?.dateTime ?? json.start?.date ?? event.start,
  };
}

export type CalendarEvent = { id: string; title: string; start: string; attendees: string[] };

/** Upcoming events on the primary calendar, used to name a recording. */
export async function listUpcomingEvents(
  userId: string,
  creds: GoogleCredentials,
  config: GoogleConfig,
  opts: { from?: Date; hours?: number } = {},
): Promise<CalendarEvent[]> {
  const token = await accessTokenFor(userId, creds, config);
  const from = opts.from ?? new Date();
  const to = new Date(from.getTime() + (opts.hours ?? 12) * 3600_000);

  const params = new URLSearchParams({
    timeMin: from.toISOString(),
    timeMax: to.toISOString(),
    // orderBy=startTime is only allowed with singleEvents, which also expands
    // recurring meetings into individual instances.
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "50",
  });

  const res = await googleFetch(token, `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`);
  if (res.status === 401) throw new GoogleReconnectError("Google rejected the saved credentials. Reconnect Google.");
  if (!res.ok) throw new GoogleError(`Calendar request failed (${res.status}).`);

  type RawEvent = {
    id: string;
    summary?: string;
    status?: string;
    start?: { dateTime?: string; date?: string };
    attendees?: { email: string; displayName?: string }[];
  };
  const json = (await res.json()) as { items?: RawEvent[] };

  return (json.items ?? [])
    .filter((e) => e.status !== "cancelled")
    .map((e) => ({
      id: e.id,
      // `summary` is absent on untitled events rather than empty.
      title: e.summary ?? "Untitled event",
      start: e.start?.dateTime ?? e.start?.date ?? "",
      attendees: (e.attendees ?? []).map((a) => a.displayName || a.email),
    }));
}
