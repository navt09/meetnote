import "server-only";
import { parseBlocks, type Inline } from "../markdown-lite";
import type { SlackCredentials } from "../connectors";

/**
 * Slack via an incoming webhook: the customer pastes one URL and we post to the
 * channel they chose when creating it. No OAuth app to register.
 *
 * The tradeoff, deliberately taken: a webhook is fixed to one channel, and it
 * cannot edit or delete a message afterwards. Moving to an OAuth app with
 * chat.postMessage is the upgrade path if either of those starts to matter.
 */

export class SlackError extends Error {}
export class SlackGoneError extends Error {}

/**
 * Slack's mrkdwn is not Markdown. Bold is *one* asterisk, and links are
 * <url|label>. Piping Markdown through unconverted is the usual bug.
 *
 * Only &, < and > are escaped; escaping more breaks the syntax. Escaping these
 * is what stops a transcript containing "<!channel>" from pinging a workspace.
 */
export function escapeMrkdwn(text: string): string {
  return (text ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function runsToMrkdwn(runs: Inline[]): string {
  return runs.map((r) => (r.bold ? `*${escapeMrkdwn(r.text)}*` : escapeMrkdwn(r.text))).join("");
}

/** Converts the Markdown our notes produce into Slack's mrkdwn. */
export function markdownToMrkdwn(markdown: string): string {
  return parseBlocks(markdown)
    .map((block) =>
      block.type === "bullets"
        ? block.items.map((item) => `• ${runsToMrkdwn(item)}`).join("\n")
        : runsToMrkdwn(block.content),
    )
    .join("\n\n");
}

export type SlackMessage = { heading: string; body: string; linkUrl?: string; linkLabel?: string };

/**
 * Posts a message. `text` is always sent alongside blocks because it is what
 * appears in push notifications and the channel sidebar.
 */
export async function postMessage(creds: SlackCredentials, message: SlackMessage): Promise<void> {
  const blocks: unknown[] = [
    { type: "header", text: { type: "plain_text", text: message.heading.slice(0, 150) } },
    { type: "section", text: { type: "mrkdwn", text: markdownToMrkdwn(message.body).slice(0, 3000) } },
  ];
  if (message.linkUrl) {
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: `<${message.linkUrl}|${escapeMrkdwn(message.linkLabel ?? "Open in From the Call")}>` },
    });
  }

  let res: Response;
  try {
    res = await fetch(creds.webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ text: message.heading, blocks }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new SlackError("Couldn't reach Slack. Try again in a moment.");
  }

  // A webhook replies with the literal text "ok", not JSON.
  const body = (await res.text().catch(() => "")).trim();
  if (res.ok && body === "ok") return;

  if (res.status === 404 || body === "no_service" || body === "no_active_hooks") {
    throw new SlackGoneError("That Slack webhook no longer exists. Create a new one and reconnect.");
  }
  if (res.status === 401 || body === "invalid_token") {
    throw new SlackGoneError("Slack rejected that webhook. Create a new one and reconnect.");
  }
  if (res.status === 403) throw new SlackError("Slack refused to post to that channel.");
  if (res.status === 429) throw new SlackError("Slack is rate limiting us. Try again shortly.");
  throw new SlackError(`Slack rejected the message${body ? `: ${body}` : ""}.`);
}

/** Confirms a webhook works by posting a short hello. */
export async function verify(creds: SlackCredentials): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await postMessage(creds, {
      heading: "From the Call is connected",
      body: "Meeting summaries you send will appear here.",
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Couldn't verify that webhook." };
  }
}
