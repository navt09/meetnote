import { NextResponse } from "next/server";
import { isBlocked, requireConnections } from "@/lib/guard";
import { loadConnector, saveConnector } from "@/lib/connector-store";
import { listSites } from "@/lib/providers/sharepoint";
import { MicrosoftReconnectError } from "@/lib/providers/microsoft";
import type { MicrosoftConfig, MicrosoftCredentials } from "@/lib/connectors";

export const runtime = "nodejs";
export const maxDuration = 60;

/** The SharePoint site a meeting's notes get saved into. */
async function connection(userId: string) {
  return loadConnector<MicrosoftCredentials, MicrosoftConfig>(userId, "microsoft");
}

export async function GET(req: Request) {
  const gate = await requireConnections(req);
  if (isBlocked(gate)) return gate;
  const { auth } = gate;

  const stored = await connection(auth.user.id);
  if (!stored) return NextResponse.json({ error: "Connect Microsoft in Settings first." }, { status: 400 });
  if (!(stored.config.scopes ?? []).includes("Sites.ReadWrite.All")) {
    return NextResponse.json(
      { error: "This connection cannot reach SharePoint. Reconnect and enable SharePoint; your IT admin may need to approve it." },
      { status: 400 },
    );
  }

  try {
    const sites = await listSites(auth.user.id, stored.credentials, stored.config);
    return NextResponse.json({ sites });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Couldn't read your SharePoint sites.";
    console.error(JSON.stringify({ event: "sharepoint_list_error", message }));
    return NextResponse.json({ error: message, needsReconnect: err instanceof MicrosoftReconnectError }, { status: 502 });
  }
}

export async function PUT(req: Request) {
  const gate = await requireConnections(req);
  if (isBlocked(gate)) return gate;
  const { auth } = gate;

  let body: { id?: string; name?: string; url?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const stored = await connection(auth.user.id);
  if (!stored) return NextResponse.json({ error: "Connect Microsoft in Settings first." }, { status: 400 });

  const id = (body.id ?? "").trim();
  const name = (body.name ?? "").trim().slice(0, 200);
  if (id && !name) return NextResponse.json({ error: "Which site?" }, { status: 400 });

  const config: MicrosoftConfig = {
    ...stored.config,
    siteId: id || undefined,
    siteName: id ? name : undefined,
    siteUrl: id ? (body.url ?? "").trim().slice(0, 500) || undefined : undefined,
  };
  await saveConnector(auth.user.id, "microsoft", stored.credentials, config);
  return NextResponse.json({ ok: true, siteName: config.siteName ?? null });
}
