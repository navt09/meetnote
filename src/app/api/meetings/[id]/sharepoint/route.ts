import { NextResponse } from "next/server";
import { isBlocked, requireConnections } from "@/lib/guard";
import { loadConnector, noteConnectorError } from "@/lib/connector-store";
import { saveNotes } from "@/lib/providers/sharepoint";
import { MicrosoftReconnectError } from "@/lib/providers/microsoft";
import { notesToMarkdown } from "@/lib/markdown";
import type { MicrosoftConfig, MicrosoftCredentials } from "@/lib/connectors";
import type { Meeting } from "@/lib/meeting";

export const runtime = "nodejs";
export const maxDuration = 60;

type Ctx = { params: Promise<{ id: string }> };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * Saves a meeting's notes into the chosen SharePoint site.
 *
 * A share rather than a draft, like posting to Slack and appending to Excel:
 * these are the meeting's own words, already on the page in front of the
 * person pressing it. Approval exists for text a model wrote that somebody
 * else will read as the user's, and there is none of that here.
 */
export async function POST(req: Request, ctx: Ctx) {
  const gate = await requireConnections(req);
  if (isBlocked(gate)) return gate;
  const { auth } = gate;

  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const { data, error } = await auth.db.from("meetings").select("id,title,notes,recorded_at").eq("id", id).maybeSingle();
  if (error) {
    console.error(JSON.stringify({ event: "sharepoint_lookup_error", id, message: error.message }));
    return NextResponse.json({ error: "Could not load that meeting." }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
  const meeting = data as Pick<Meeting, "id" | "title" | "notes" | "recorded_at">;
  if (!meeting.notes) return NextResponse.json({ error: "This meeting has no notes to save yet." }, { status: 400 });

  const stored = await loadConnector<MicrosoftCredentials, MicrosoftConfig>(auth.user.id, "microsoft");
  if (!stored) return NextResponse.json({ error: "Connect Microsoft in Settings first." }, { status: 400 });
  if (!stored.config.siteId) {
    return NextResponse.json({ error: "Choose a SharePoint site in Settings first." }, { status: 400 });
  }

  try {
    const saved = await saveNotes(auth.user.id, stored.credentials, stored.config, stored.config.siteId, {
      title: meeting.title,
      recordedAt: meeting.recorded_at,
      markdown: notesToMarkdown(meeting.notes, new Date(meeting.recorded_at)),
    });
    await noteConnectorError(auth.user.id, "microsoft", null);
    console.log(JSON.stringify({ event: "sharepoint_saved", id }));
    return NextResponse.json({ ok: true, url: saved.url, name: saved.name, site: stored.config.siteName ?? "SharePoint" });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Couldn't save those notes to SharePoint.";
    await noteConnectorError(auth.user.id, "microsoft", message);
    console.error(JSON.stringify({ event: "sharepoint_save_error", id, message }));
    return NextResponse.json({ error: message, needsReconnect: err instanceof MicrosoftReconnectError }, { status: 502 });
  }
}
