import "server-only";
import { getTicketProvider, loadConnector, noteConnectorError } from "./connector-store";
import * as linear from "./providers/linear";
import * as jira from "./providers/jira";
import * as google from "./providers/google";
import type {
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
  | { delivered: true; destination: string; url: string; label: string }
  | { delivered: false; reason: "not_configured" };

export class DeliveryError extends Error {
  /** True when the fix is reconnecting, rather than retrying. */
  needsReconnect: boolean;
  constructor(message: string, needsReconnect = false) {
    super(message);
    this.needsReconnect = needsReconnect;
  }
}

async function deliverTicket(userId: string, draft: DraftRow): Promise<Delivery> {
  const provider = await getTicketProvider(userId);
  if (!provider) return { delivered: false, reason: "not_configured" };

  if (provider === "linear") {
    const stored = await loadConnector<LinearCredentials, LinearConfig>(userId, "linear");
    if (!stored?.config.teamId) return { delivered: false, reason: "not_configured" };
    try {
      const issue = await linear.createIssue(stored.credentials, {
        teamId: stored.config.teamId,
        title: draft.subject,
        description: draft.body,
      });
      await noteConnectorError(userId, "linear", null);
      return { delivered: true, destination: "linear", url: issue.url, label: issue.identifier };
    } catch (err) {
      const reconnect = err instanceof linear.LinearAuthError;
      const message = err instanceof Error ? err.message : "Linear rejected the issue.";
      await noteConnectorError(userId, "linear", message);
      throw new DeliveryError(message, reconnect);
    }
  }

  const stored = await loadConnector<JiraCredentials, JiraConfig>(userId, "jira");
  if (!stored?.config.projectKey) return { delivered: false, reason: "not_configured" };
  try {
    const issue = await jira.createIssue(stored.credentials, {
      projectKey: stored.config.projectKey,
      summary: draft.subject,
      description: draft.body,
      issueType: stored.config.issueType ?? "Task",
    });
    await noteConnectorError(userId, "jira", null);
    return { delivered: true, destination: "jira", url: issue.url, label: issue.key };
  } catch (err) {
    const reconnect = err instanceof jira.JiraAuthError;
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

export async function deliverDraft(userId: string, draft: DraftRow): Promise<Delivery> {
  return draft.kind === "ticket" ? deliverTicket(userId, draft) : deliverEmail(userId, draft);
}
