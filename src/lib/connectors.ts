// Shared shapes for third-party connections. Pure types and helpers; the
// server-only storage lives in connector-store.ts.

export type Provider = "linear" | "jira" | "slack" | "google";
export type TicketProvider = "linear" | "jira";

export const PROVIDERS: Provider[] = ["linear", "jira", "slack", "google"];
export const TICKET_PROVIDERS: TicketProvider[] = ["linear", "jira"];

/** Secrets. Never leaves the server. */
/**
 * apiKey holds either a pasted personal API key or an OAuth access token.
 * oauth distinguishes them, because the two need different Authorization
 * headers and only the OAuth one can be refreshed.
 */
export type LinearCredentials = {
  apiKey: string;
  oauth?: boolean;
  refreshToken?: string;
  expiresAt?: number;
};
/**
 * Either an API token (site URL + email + token) or OAuth (access token +
 * cloud id). siteUrl is kept in both cases because only it can build a
 * clickable /browse/KEY link; a cloud id cannot.
 */
export type JiraCredentials = {
  siteUrl: string;
  email?: string;
  apiToken?: string;
  oauth?: boolean;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
  cloudId?: string;
};
export type SlackCredentials = { webhookUrl: string };
export type GoogleCredentials = { refreshToken: string; accessToken?: string; expiresAt?: number };

export type Credentials = LinearCredentials | JiraCredentials | SlackCredentials | GoogleCredentials;

/** Non-secret settings. Safe to show the user. */
export type LinearConfig = { teamId?: string; teamName?: string };
export type JiraConfig = { siteUrl?: string; projectKey?: string; projectName?: string; issueType?: string };
export type SlackConfig = { channelName?: string };
export type GoogleConfig = { email?: string; scopes?: string[] };

export type ConnectorConfig = LinearConfig | JiraConfig | SlackConfig | GoogleConfig;

export type ConnectorRow = {
  id: string;
  user_id: string;
  provider: Provider;
  credentials: string; // encrypted
  config: ConnectorConfig;
  last_error: string | null;
  last_used_at: string | null;
  created_at: string;
  updated_at: string;
};

/** What the browser sees: that it's connected, and the harmless settings. Never the secret. */
export type PublicConnector = {
  provider: Provider;
  connected: true;
  config: ConnectorConfig;
  lastError: string | null;
  connectedAt: string;
};

export function toPublicConnector(row: ConnectorRow): PublicConnector {
  return {
    provider: row.provider,
    connected: true,
    config: row.config ?? {},
    lastError: row.last_error,
    connectedAt: row.created_at,
  };
}

export const PROVIDER_LABEL: Record<Provider, string> = {
  linear: "Linear",
  jira: "Jira",
  slack: "Slack",
  google: "Google",
};

/** One-line description of what connecting each provider actually does. */
export const PROVIDER_PURPOSE: Record<Provider, string> = {
  linear: "Approved tickets are created as Linear issues.",
  jira: "Approved tickets are created as Jira issues.",
  slack: "Post a meeting summary to a channel.",
  google: "Send approved emails from your Gmail, and block tasks out on your calendar.",
};

/** True when the connector has everything it needs to actually be used. */
export function isUsable(provider: Provider, config: ConnectorConfig): boolean {
  switch (provider) {
    case "linear":
      return !!(config as LinearConfig).teamId;
    case "jira":
      return !!(config as JiraConfig).projectKey;
    default:
      return true;
  }
}

/** Trims a Jira site to a bare origin: "https://acme.atlassian.net". */
export function normaliseJiraSite(input: string): string | null {
  const raw = (input ?? "").trim().replace(/\/+$/, "");
  if (!raw) return null;
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(withScheme);
    if (!url.hostname.includes(".")) return null;
    return `https://${url.hostname}`;
  } catch {
    return null;
  }
}

/** Slack webhook URLs all live on hooks.slack.com; anything else is a mistake or worse. */
export function isValidSlackWebhook(input: string): boolean {
  try {
    const url = new URL((input ?? "").trim());
    return url.protocol === "https:" && url.hostname === "hooks.slack.com" && url.pathname.startsWith("/services/");
  } catch {
    return false;
  }
}
