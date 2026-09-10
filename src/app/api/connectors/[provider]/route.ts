import { NextResponse } from "next/server";
import { isBlocked, requireConnections } from "@/lib/guard";
import { deleteConnector } from "@/lib/connector-store";
import { PROVIDERS, type Provider } from "@/lib/connectors";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ provider: string }> };

/** Disconnect. Removes the stored credentials entirely. */
export async function DELETE(req: Request, ctx: Ctx) {
  const gate = await requireConnections(req);
  if (isBlocked(gate)) return gate;
  const { auth } = gate;

  const { provider } = await ctx.params;
  if (!PROVIDERS.includes(provider as Provider)) return NextResponse.json({ error: "Unknown connection" }, { status: 400 });

  try {
    await deleteConnector(auth.user.id, provider as Provider);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(JSON.stringify({ event: "connector_delete_error", provider, message: err instanceof Error ? err.message : String(err) }));
    return NextResponse.json({ error: "Could not disconnect. Try again." }, { status: 500 });
  }
}
