import { NextResponse } from "next/server";
import { getAuth } from "@/lib/supabase/server";
import { toPublicConnector, type ConnectorRow, type TicketProvider } from "@/lib/connectors";
import { credentialsKeyConfigured } from "@/lib/crypto";

export const runtime = "nodejs";

/**
 * What the caller has connected. Deliberately selects only the non-secret
 * columns, so the encrypted blob cannot leave the server even by accident.
 */
export async function GET(req: Request) {
  const auth = await getAuth(req);
  if (!auth) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const [connectorsRes, settingsRes] = await Promise.all([
    auth.db.from("connectors").select("provider,config,last_error,created_at"),
    auth.db.from("user_settings").select("ticket_provider").maybeSingle(),
  ]);

  if (connectorsRes.error) {
    console.error(JSON.stringify({ event: "connectors_list_error", message: connectorsRes.error.message }));
    return NextResponse.json({ error: "Could not load your connections." }, { status: 500 });
  }

  const rows = (connectorsRes.data ?? []) as Pick<ConnectorRow, "provider" | "config" | "last_error" | "created_at">[];
  return NextResponse.json({
    connectors: rows.map((r) => toPublicConnector(r as ConnectorRow)),
    ticketProvider: ((settingsRes.data as { ticket_provider: TicketProvider | null } | null)?.ticket_provider) ?? null,
    // Without this the server cannot store anything; the UI says so rather than failing on save.
    storageReady: credentialsKeyConfigured(),
  });
}
