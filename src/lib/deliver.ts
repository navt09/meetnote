import "server-only";
import { getTicketProvider, loadConnector, noteConnectorError } from "./connector-store";
import * as linear from "./providers/linear";
import * as linearOAuth from "./providers/linear-oauth";
import * as jira from "./providers/jira";
import * as jiraOAuth from "./providers/jira-oauth";
import * as google from "./providers/google";
import * as slack from "./providers/slack";
import { isSendTo, type SendTo } from "./draft-destination";
import type {
  SlackConfig,
  SlackCredentials,
  TicketProvider,
  GoogleConfig,
  GoogleCredentials,
  JiraConfig,
  JiraCredentials,
  LinearConfig,
  LinearCredentials,
} from "./connectors";
import type { DraftRow } from "./draft";

/**
 * Sends an approved draft to wherever it belongs. Called only after a person
 * has pressed Approve; there is deliberately no path that reaches these
 * functions without that.
 *
 * When nothing is connected this is a no-op and the draft stays copy-and-paste,
 * which is the behaviour before any connector existed.
 */

export type Delivery =
  /** `url` is null where the destination gives nothing to link back to, which is Slack. */
  | { delivered: true; destination: SendTo; url: string | null; label: string }
  | { delivered: false; reason: "not_configured" | "copy_only" };

export class DeliveryError extends Error {
  /** True when the fix is reconnecting, rather than retrying. */
  needsReconnect: boolean;
  constructor(message: string, needsReconnect = false) {
    super(message);
    this.needsReconnect = needsReconnect;
  }
}

async function deliverSlack(userId: string, draft: DraftRow): Promise<Delivery> {
  const stored = await loadConnector<SlackCredentials, SlackConfig>(userId, "slack");
  if (!stored) return { delivered: false, reason: "not_configured" };
  try {
    await slack.postMessage(stored.credentials, { heading: draft.subject, body: draft.body });
    await noteConnectorError(userId, "slack", null);
    // An incoming webhook returns no permalink, so there is nothing honest to
    // link to. The receipt is the destination itself.
    return { delivered: true, destination: "slack", url: null, label: stored.config.channelName ?? "Slack" };
  } catch (err) {
    const reconnect = err instanceof slack.SlackGoneError;
    const message = err instanceof Error ? err.message : "Slack rejected the message.";
    await noteConnectorError(userId, "slack", message);
    throw new DeliveryError(message, reconnect);
  }
}

async function deliverTicket(userId: string, draft: DraftRow, provider: TicketProvider): Promise<Delivery> {
  if (provider === "linear") {
    const stored = await loadConnector<LinearCredentials, LinearConfig>(userId, "linear");
    if (!stored?.config.teamId) return { delivered: false, reason: "not_configured" };
    try {
      // OAuth access tokens last 24 hours, so refresh before using them.
      const token = await linearOAuth.accessTokenFor(userId, stored.credentials, stored.config);
      const creds = { ...stored.credentials, apiKey: token };
      const issue = await linear.createIssue(creds, {
        teamId: stored.config.teamId,
        title: draft.subject,
        description: draft.body,
      });
      await noteConnectorError(userId, "linear", null);
      return { delivered: true, destination: "linear", url: issue.url, label: issue.identifier };
    } catch (err) {
      const reconnect = err instanceof linear.LinearAuthError || err instanceof linearOAuth.LinearReconnectError;
      const message = err instanceof Error ? err.message : "Linear rejected the issue.";
      await noteConnectorError(userId, "linear", message);
      throw new DeliveryError(message, reconnect);
    }
  }

  const stored = await loadConnector<JiraCredentials, JiraConfig>(userId, "jira");
  if (!stored?.config.projectKey) return { delivered: false, reason: "not_configured" };
  try {
    // Refreshing also rotates and re-stores the refresh token.
    const creds = await jiraOAuth.accessTokenFor(userId, stored.credentials, stored.config);
    const issue = await jira.createIssue(creds, {
      projectKey: stored.config.projectKey,
      summary: draft.subject,
      description: draft.body,
      issueType: stored.config.issueType ?? "Task",
    });
    await noteConnectorError(userId, "jira", null);
    return { delivered: true, destination: "jira", url: issue.url, label: issue.key };
  } catch (err) {
    const reconnect = err instanceof jira.JiraAuthError || err instanceof jiraOAuth.JiraReconnectError;
    const message = err instanceof Error ? err.message : "Jira rejected the issue.";
    await noteConnectorError(userId, "jira", message);
    throw new DeliveryError(message, reconnect);
  }
}

async function deliverEmail(userId: string, draft: DraftRow): Promise<Delivery> {
  const stored = await loadConnector<GoogleCredentials, GoogleConfig>(userId, "google");
  if (!stored) return { delivered: false, reason: "not_configured" };

  // The draft names a person, not an address. Sending needs a real address, and
  // guessing one would be worse than asking.
  const to = (draft.recipient ?? "").trim();
  if (!to.includes("@")) {
    throw new DeliveryError(`No email address for ${to || "that person"}. Add one to the draft before sending.`);
  }

  try {
    await google.sendEmail(userId, stored.credentials, stored.config, { to, subject: draft.subject, body: draft.body });
    await noteConnectorError(userId, "google", null);
    return { delivered: true, destination: "gmail", url: "https://mail.google.com/mail/u/0/#sent", label: "Sent" };
  } catch (err) {
    const reconnect = err instanceof google.GoogleReconnectError;
    const message = err instanceof Error ? err.message : "Gmail rejected the message.";
    await noteConnectorError(userId, "google", message);
    throw new DeliveryError(message, reconnect);
  }
}

/**
 * Where this draft is going. The choice stored on the row wins; a row written
 * before destinations were a choice falls back to the account-wide setting,
 * which is exactly what it did then.
 */
async function resolveSendTo(userId: string, draft: DraftRow): Promise<SendTo | null> {
  if (isSendTo(draft.send_to)) return draft.send_to;
  if (draft.kind === "email") return "gmail";
  return await getTicketProvider(userId);
}

export async function deliverDraft(userId: string, draft: DraftRow): Promise<Delivery> {
  const to = await resolveSendTo(userId, draft);
  // Not a failure: somebody chose to copy it out, or never set anything up.
  if (!to || to === "copy") return { delivered: false, reason: to === "copy" ? "copy_only" : "not_configured" };
  if (to === "gmail") return deliverEmail(userId, draft);
  if (to === "slack") return deliverSlack(userId, draft);
  return deliverTicket(userId, draft, to);
}
