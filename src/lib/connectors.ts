// Shared shapes for third-party connections. Pure types and helpers; the
// server-only storage lives in connector-store.ts.

export type Provider = "linear" | "jira" | "slack" | "google" | "microsoft";
export type TicketProvider = "linear" | "jira";

// Microsoft is one connector covering Outlook, Teams, Planner, SharePoint and
// Excel: one Entra app, one consent, and scopes decide the rest. Five rows
// would mean five sign-ins for one account.
export const PROVIDERS: Provider[] = ["linear", "jira", "slack", "google", "microsoft"];
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
/**
 * Microsoft rotates the refresh token on every refresh and retires the old
 * one, so this is rewritten each time rather than only read.
 */
export type MicrosoftCredentials = { refreshToken: string; accessToken?: string; expiresAt?: number };

export type Credentials =
  | LinearCredentials
  | JiraCredentials
  | SlackCredentials
  | GoogleCredentials
  | MicrosoftCredentials;

/** Non-secret settings. Safe to show the user. */
export type LinearConfig = { teamId?: string; teamName?: string };
export type JiraConfig = { siteUrl?: string; projectKey?: string; projectName?: string; issueType?: string };
export type SlackConfig = { channelName?: string };
export type GoogleConfig = { email?: string; scopes?: string[] };
/**
 * One row covering several products, so the config holds a choice per
 * product: which Teams channel, which Planner plan, which SharePoint site,
 * which workbook. All optional — connecting is not choosing.
 */
export type MicrosoftConfig = {
  name?: string;
  email?: string;
  scopes?: string[];
  /** A personal Microsoft account, which has no Teams channels or SharePoint sites at all. */
  personal?: boolean;
  teamId?: string;
  teamName?: string;
  channelId?: string;
  channelName?: string;
  /** Chosen SharePoint site for saved notes. */
  siteUrl?: string;
  planId?: string;
  planName?: string;
  bucketId?: string;
  siteId?: string;
  siteName?: string;
  workbookId?: string;
  workbookName?: string;
};

export type ConnectorConfig = LinearConfig | JiraConfig | SlackConfig | GoogleConfig | MicrosoftConfig;

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
  microsoft: "Microsoft",
};

/** One-line description of what connecting each provider actually does. */
export const PROVIDER_PURPOSE: Record<Provider, string> = {
  linear: "Approved tickets are created as Linear issues.",
  jira: "Approved tickets are created as Jira issues.",
  slack: "Post a meeting summary to a channel.",
  google: "Send approved emails from your Gmail, and block tasks out on your calendar.",
  microsoft: "One sign-in for Outlook, Teams, Planner, SharePoint and Excel.",
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

/**
 * Trims a Jira site to a bare origin: "https://acme.atlassian.net".
 *
 * The server later fetches from this address with the customer's own token, so
 * it must be a public hostname: IP literals and localhost are refused so the
 * form cannot be used to make this server call something on its own network.
 */
export function normaliseJiraSite(input: string): string | null {
  const raw = (input ?? "").trim().replace(/\/+$/, "");
  if (!raw) return null;
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(withScheme);
    const host = url.hostname.toLowerCase();
    if (!host.includes(".")) return null;
    if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) return null;
    // Anything made only of digits and dots is an IPv4 literal; brackets mean IPv6.
    if (/^[\d.]+$/.test(host) || host.startsWith("[")) return null;
    return `https://${host}`;
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
