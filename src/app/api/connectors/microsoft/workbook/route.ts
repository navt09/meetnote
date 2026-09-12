import { NextResponse } from "next/server";
import { isBlocked, requireConnections } from "@/lib/guard";
import { loadConnector, saveConnector } from "@/lib/connector-store";
import { listWorkbooks } from "@/lib/providers/excel";
import { MicrosoftReconnectError } from "@/lib/providers/microsoft";
import type { MicrosoftConfig, MicrosoftCredentials } from "@/lib/connectors";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * The workbook a meeting's tasks get appended to.
 *
 * Chosen rather than created: Graph's workbook APIs refuse an empty file, so
 * making one would mean shipping a binary .xlsx in the source and uploading
 * it. Pressing New > Excel workbook in OneDrive once is a smaller ask.
 */
async function connection(userId: string) {
  return loadConnector<MicrosoftCredentials, MicrosoftConfig>(userId, "microsoft");
}

/** The .xlsx files in this person's OneDrive, to choose from. */
export async function GET(req: Request) {
  const gate = await requireConnections(req);
  if (isBlocked(gate)) return gate;
  const { auth } = gate;

  const stored = await connection(auth.user.id);
  if (!stored) return NextResponse.json({ error: "Connect Microsoft in Settings first." }, { status: 400 });
  if (!(stored.config.scopes ?? []).includes("Files.ReadWrite")) {
    return NextResponse.json(
      { error: "That Microsoft connection cannot reach your files. Reconnect Microsoft in Settings." },
      { status: 400 },
    );
  }

  try {
    const workbooks = await listWorkbooks(auth.user.id, stored.credentials, stored.config);
    return NextResponse.json({ workbooks });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Couldn't read your OneDrive.";
    console.error(JSON.stringify({ event: "excel_list_error", message }));
    return NextResponse.json({ error: message, needsReconnect: err instanceof MicrosoftReconnectError }, { status: 502 });
  }
}

/** Remembers the chosen workbook. Nothing is written to it here. */
export async function PUT(req: Request) {
  const gate = await requireConnections(req);
  if (isBlocked(gate)) return gate;
  const { auth } = gate;

  let body: { id?: string; name?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const stored = await connection(auth.user.id);
  if (!stored) return NextResponse.json({ error: "Connect Microsoft in Settings first." }, { status: 400 });

  // Clearing the choice is a real action, not an error: somebody may want to
  // stop a register they no longer keep.
  const id = (body.id ?? "").trim();
  const name = (body.name ?? "").trim().slice(0, 200);
  if (id && !name) return NextResponse.json({ error: "Which workbook?" }, { status: 400 });

  const config: MicrosoftConfig = {
    ...stored.config,
    workbookId: id || undefined,
    workbookName: id ? name : undefined,
  };
  await saveConnector(auth.user.id, "microsoft", stored.credentials, config);
  return NextResponse.json({ ok: true, workbookName: config.workbookName ?? null });
}
