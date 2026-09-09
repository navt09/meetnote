import "server-only";
import type { SlackCredentials } from "../connectors";

/**
 * Slack OAuth, so a customer presses Connect and picks a channel in Slack's own
 * install screen rather than creating a webhook by hand.
 *
 * We request the incoming-webhook scope, which means Slack shows a channel
 * picker during install and hands back a webhook URL. That keeps the posting
 * code identical to the pasted-webhook path while removing all the setup work.
 */

const AUTHORIZE_URL = "https://slack.com/oauth/v2/authorize";
const ACCESS_URL = "https://slack.com/api/oauth.v2.access";

export const SLACK_SCOPES = ["incoming-webhook"];

export class SlackOAuthError extends Error {}

export function slackOAuthConfigured(): boolean {
  return !!(process.env.SLACK_CLIENT_ID && process.env.SLACK_CLIENT_SECRET);
}

function clientCreds() {
  const id = process.env.SLACK_CLIENT_ID;
  const secret = process.env.SLACK_CLIENT_SECRET;
  if (!id || !secret) throw new SlackOAuthError("Slack sign-in isn't configured on this server.");
  return { id, secret };
}

export function redirectUri(origin: string): string {
  return new URL("/api/connectors/slack/callback", origin).toString();
}

export function authUrl(origin: string, state: string): string {
  const { id } = clientCreds();
  const params = new URLSearchParams({
    client_id: id,
    scope: SLACK_SCOPES.join(","),
    redirect_uri: redirectUri(origin),
    state,
  });
  return `${AUTHORIZE_URL}?${params}`;
}

type AccessResponse = {
  ok: boolean;
  error?: string;
  team?: { id: string; name: string };
  incoming_webhook?: { channel: string; channel_id: string; url: string };
};

export async function exchangeCode(
  origin: string,
  code: string,
): Promise<{ credentials: SlackCredentials; channelName: string; teamName: string }> {
  const { id, secret } = clientCreds();

  let res: Response;
  try {
    res = await fetch(ACCESS_URL, {
      method: "POST",
      headers: {
        // Slack prefers the client credentials in a Basic header over the body.
        Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ code, redirect_uri: redirectUri(origin) }),
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new SlackOAuthError("Couldn't reach Slack. Try again in a moment.");
  }

  // Slack answers 200 even for failures; the ok field is what matters.
  const json = (await res.json().catch(() => ({}))) as AccessResponse;
  if (!json.ok) throw new SlackOAuthError(`Slack rejected the connection${json.error ? `: ${json.error}` : ""}.`);
  if (!json.incoming_webhook?.url) {
    throw new SlackOAuthError("Slack didn't return a channel to post to. Try again and pick a channel.");
  }

  return {
    credentials: { webhookUrl: json.incoming_webhook.url },
    channelName: json.incoming_webhook.channel,
    teamName: json.team?.name ?? "Slack",
  };
}
