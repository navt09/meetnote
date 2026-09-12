import "server-only";
import { accessTokenFor, graph } from "./microsoft";
import type { MicrosoftConfig, MicrosoftCredentials } from "../connectors";

/**
 * Posting a follow-up into a Microsoft Teams channel.
 *
 * Three permissions, not one. `ChannelMessage.Send` posts; `Team.ReadBasic.All`
 * and `Channel.ReadBasic.All` are what let somebody *choose* where it goes.
 * A tenant admin can approve some and not the others, so "can post" and "can
 * pick a channel" are genuinely different states and the UI shows both.
 *
 * Work and school accounts only, and not because of permissions: a personal
 * Microsoft account has the Teams app but no teams and no channels, so there
 * is nothing here for it to address.
 */

export type Team = { id: string; name: string };
export type Channel = { id: string; name: string };

export async function listTeams(
  userId: string,
  creds: MicrosoftCredentials,
  config: MicrosoftConfig,
): Promise<Team[]> {
  const token = await accessTokenFor(userId, creds, config);
  const res = await graph<{ value: { id: string; displayName: string }[] }>(token, "/me/joinedTeams", {
    query: { $select: "id,displayName" },
  });
  return (res.value ?? []).map((t) => ({ id: t.id, name: t.displayName }));
}

export async function listChannels(
  userId: string,
  creds: MicrosoftCredentials,
  config: MicrosoftConfig,
  teamId: string,
): Promise<Channel[]> {
  const token = await accessTokenFor(userId, creds, config);
  const res = await graph<{ value: { id: string; displayName: string }[] }>(token, `/teams/${teamId}/channels`, {
    query: { $select: "id,displayName" },
  });
  return (res.value ?? []).map((c) => ({ id: c.id, name: c.displayName }));
}

/**
 * Posts one message as the signed-in person.
 *
 * The body is sent as HTML because Teams renders nothing else — plain text
 * arrives as one unbroken paragraph with the Markdown still in it. That means
 * building markup from a draft, so every piece of the text is escaped first
 * and only a bold subject line and paragraph breaks are added. Nothing from
 * the model reaches the message as markup; the same rule `markdown-lite.ts`
 * follows for the preview.
 */
export async function postToChannel(
  userId: string,
  creds: MicrosoftCredentials,
  config: MicrosoftConfig,
  message: { teamId: string; channelId: string; subject: string; body: string },
): Promise<{ id: string; url: string | null }> {
  const token = await accessTokenFor(userId, creds, config);
  const created = await graph<{ id: string; webUrl?: string }>(
    token,
    `/teams/${message.teamId}/channels/${message.channelId}/messages`,
    {
      method: "POST",
      body: {
        subject: message.subject,
        body: { contentType: "html", content: toTeamsHtml(message.subject, message.body) },
      },
    },
  );
  return { id: created.id, url: created.webUrl ?? null };
}

/**
 * A draft as Teams-safe HTML: escaped text, a bold first line, and paragraphs.
 *
 * Deliberately not a Markdown renderer. A channel message needs to be
 * readable, not typeset, and every feature added here is another way for
 * transcript text to become markup in somebody else's client.
 */
export function toTeamsHtml(subject: string, body: string): string {
  const paragraphs = body
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, "<br/>")}</p>`)
    .join("");
  return `<p><b>${escapeHtml(subject)}</b></p>${paragraphs}`;
}

export function escapeHtml(text: string): string {
  return (text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
