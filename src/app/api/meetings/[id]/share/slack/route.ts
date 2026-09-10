import { NextResponse } from "next/server";
import { isBlocked, requireConnections } from "@/lib/guard";
import { loadConnector, noteConnectorError } from "@/lib/connector-store";
import { postMessage, SlackGoneError } from "@/lib/providers/slack";
import { notesToMarkdown } from "@/lib/markdown";
import type { SlackConfig, SlackCredentials } from "@/lib/connectors";
import type { Meeting } from "@/lib/meeting";

export const runtime = "nodejs";
export const maxDuration = 60;

type Ctx = { params: Promise<{ id: string }> };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * Post a meeting's notes to the connected Slack channel.
 *
 * This is a share, not a draft: the person pressing it has already read the
 * notes on the page in front of them, so there is nothing for an approval step
 * to add. It is also the only outward action in the product that sends the
 * meeting's own words rather than something a model wrote, which is why it
 * does not go through the approvals queue.
 */
export async function POST(req: Request, ctx: Ctx) {
  const gate = await requireConnections(req);
  if (isBlocked(gate)) return gate;
  const { auth } = gate;

  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const { data, error } = await auth.db.from("meetings").select("id,title,notes,recorded_at").eq("id", id).maybeSingle();
  if (error) {
    console.error(JSON.stringify({ event: "share_slack_lookup_error", id, message: error.message }));
    return NextResponse.json({ error: "Could not load that meeting." }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
  const meeting = data as Pick<Meeting, "id" | "title" | "notes" | "recorded_at">;
  if (!meeting.notes) return NextResponse.json({ error: "This meeting has no notes to share yet." }, { status: 400 });

  const connector = await loadConnector<SlackCredentials, SlackConfig>(auth.user.id, "slack");
  if (!connector) return NextResponse.json({ error: "Connect Slack in Settings first." }, { status: 400 });

  const origin = new URL(req.url).origin;
  try {
    await postMessage(connector.credentials, {
      heading: meeting.title,
      body: notesToMarkdown(meeting.notes, new Date(meeting.recorded_at)),
      linkUrl: `${origin}/meetings/${meeting.id}`,
      linkLabel: "Open the full notes",
    });
    await noteConnectorError(auth.user.id, "slack", null);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not post to Slack.";
    await noteConnectorError(auth.user.id, "slack", message);
    console.error(JSON.stringify({ event: "share_slack_error", id, message }));
    return NextResponse.json(
      { error: message, needsReconnect: err instanceof SlackGoneError },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true });
}
