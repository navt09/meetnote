import { NextResponse } from "next/server";
import { isBlocked, requireConnections } from "@/lib/guard";
import { loadConnector, saveConnector } from "@/lib/connector-store";
import { listChannels, listTeams } from "@/lib/providers/teams";
import { MicrosoftReconnectError } from "@/lib/providers/microsoft";
import { canPickTeamsChannel } from "@/lib/microsoft-scopes";
import type { MicrosoftConfig, MicrosoftCredentials } from "@/lib/connectors";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Choosing the Teams channel a follow-up gets posted to.
 *
 * Listing is not sending. `ChannelMessage.Send` can post to a channel but
 * cannot see that any channel exists, so this needs `Team.ReadBasic.All` and
 * `Channel.ReadBasic.All` as well — and a tenant admin can approve one and not
 * the others, which is why that case gets its own sentence rather than an
 * empty list.
 */
async function connection(userId: string) {
  return loadConnector<MicrosoftCredentials, MicrosoftConfig>(userId, "microsoft");
}

/** Teams, or the channels of one team when `team` is given. */
export async function GET(req: Request) {
  const gate = await requireConnections(req);
  if (isBlocked(gate)) return gate;
  const { auth } = gate;

  const stored = await connection(auth.user.id);
  if (!stored) return NextResponse.json({ error: "Connect Microsoft in Settings first." }, { status: 400 });
  if (!canPickTeamsChannel(stored.config.scopes)) {
    return NextResponse.json(
      { error: "This connection can post to Teams but not list your teams. Reconnect and enable Teams; your IT admin may need to approve it." },
      { status: 400 },
    );
  }

  const teamId = new URL(req.url).searchParams.get("team");
  try {
    if (teamId) {
      const channels = await listChannels(auth.user.id, stored.credentials, stored.config, teamId);
      return NextResponse.json({ channels });
    }
    const teams = await listTeams(auth.user.id, stored.credentials, stored.config);
    return NextResponse.json({ teams });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Couldn't read your Teams.";
    console.error(JSON.stringify({ event: "teams_list_error", message }));
    return NextResponse.json({ error: message, needsReconnect: err instanceof MicrosoftReconnectError }, { status: 502 });
  }
}

/** Remembers the chosen team and channel. Nothing is posted here. */
export async function PUT(req: Request) {
  const gate = await requireConnections(req);
  if (isBlocked(gate)) return gate;
  const { auth } = gate;

  let body: { teamId?: string; teamName?: string; channelId?: string; channelName?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const stored = await connection(auth.user.id);
  if (!stored) return NextResponse.json({ error: "Connect Microsoft in Settings first." }, { status: 400 });

  const teamId = (body.teamId ?? "").trim();
  const channelId = (body.channelId ?? "").trim();
  // Both or neither: a team without a channel is not somewhere a message can
  // go, and storing half a choice would make the destination look ready.
  if ((teamId && !channelId) || (channelId && !teamId)) {
    return NextResponse.json({ error: "Pick a team and a channel." }, { status: 400 });
  }

  const config: MicrosoftConfig = {
    ...stored.config,
    teamId: teamId || undefined,
    teamName: teamId ? (body.teamName ?? "").trim().slice(0, 200) : undefined,
    channelId: channelId || undefined,
    channelName: channelId ? (body.channelName ?? "").trim().slice(0, 200) : undefined,
  };
  await saveConnector(auth.user.id, "microsoft", stored.credentials, config);
  return NextResponse.json({ ok: true, channelName: config.channelName ?? null });
}
