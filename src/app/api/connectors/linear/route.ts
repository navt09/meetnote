import { NextResponse } from "next/server";
import { isBlocked, requireConnections } from "@/lib/guard";
import { disconnectRoute } from "@/lib/disconnect-route";
import { loadConnector, saveConnector, updateConnectorConfig } from "@/lib/connector-store";
import { credentialsKeyConfigured } from "@/lib/crypto";
import { verify } from "@/lib/providers/linear";
import type { LinearConfig, LinearCredentials } from "@/lib/connectors";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Save a Linear key. The key is checked against Linear before it is stored, and
 * the teams it can see come back so the person can pick one.
 */
export async function POST(req: Request) {
  const gate = await requireConnections(req);
  if (isBlocked(gate)) return gate;
  const { auth } = gate;
  if (!credentialsKeyConfigured()) {
    return NextResponse.json({ error: "Credential storage isn't configured on the server yet." }, { status: 503 });
  }

  let body: { apiKey?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const apiKey = (body.apiKey ?? "").trim();
  if (!apiKey) return NextResponse.json({ error: "Paste your Linear API key." }, { status: 400 });

  const result = await verify({ apiKey });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  if (result.teams.length === 0) {
    return NextResponse.json({ error: "That key works, but it can't see any Linear teams." }, { status: 400 });
  }

  // Default to the only team when there is just one, so the common case needs no second step.
  const only = result.teams.length === 1 ? result.teams[0] : null;
  const config: LinearConfig = only ? { teamId: only.id, teamName: only.name } : {};

  try {
    await saveConnector(auth.user.id, "linear", { apiKey } satisfies LinearCredentials, config);
  } catch (err) {
    console.error(JSON.stringify({ event: "linear_save_error", message: err instanceof Error ? err.message : String(err) }));
    return NextResponse.json({ error: "Could not save that key. Try again." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, teams: result.teams, config });
}

/** Choose which team new issues go into. */
export async function PATCH(req: Request) {
  const gate = await requireConnections(req);
  if (isBlocked(gate)) return gate;
  const { auth } = gate;

  let body: { teamId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const teamId = (body.teamId ?? "").trim();
  if (!teamId) return NextResponse.json({ error: "Pick a team." }, { status: 400 });

  const stored = await loadConnector<LinearCredentials, LinearConfig>(auth.user.id, "linear");
  if (!stored) return NextResponse.json({ error: "Connect Linear first." }, { status: 400 });

  // Only a team this key can actually see.
  const result = await verify(stored.credentials);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  const team = result.teams.find((t) => t.id === teamId);
  if (!team) return NextResponse.json({ error: "That team isn't one this key can see." }, { status: 400 });

  await updateConnectorConfig(auth.user.id, "linear", { teamId: team.id, teamName: team.name } satisfies LinearConfig);
  return NextResponse.json({ ok: true, config: { teamId: team.id, teamName: team.name } });
}

/** Teams for the picker, using the already-stored key. */
export async function GET(req: Request) {
  // Verifying a stored connection is a connected-app action like any other.
  const gate = await requireConnections(req);
  if (isBlocked(gate)) return gate;
  const { auth } = gate;

  const stored = await loadConnector<LinearCredentials, LinearConfig>(auth.user.id, "linear");
  if (!stored) return NextResponse.json({ error: "Connect Linear first." }, { status: 404 });

  const result = await verify(stored.credentials);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ teams: result.teams, config: stored.config });
}

/** Disconnect. Bound here because the static route shadows [provider]. */
export const DELETE = disconnectRoute("linear");
