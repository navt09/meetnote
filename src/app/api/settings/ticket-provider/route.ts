import { NextResponse } from "next/server";
import { getAuth } from "@/lib/supabase/server";
import { setTicketProvider } from "@/lib/connector-store";
import { TICKET_PROVIDERS, type TicketProvider } from "@/lib/connectors";

export const runtime = "nodejs";

/** Which system an approved ticket gets pushed to. Null means copy-paste only. */
export async function PUT(req: Request) {
  const auth = await getAuth(req);
  if (!auth) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  let body: { provider?: string | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const provider = body.provider ?? null;
  if (provider !== null && !TICKET_PROVIDERS.includes(provider as TicketProvider)) {
    return NextResponse.json({ error: "Unknown ticket system" }, { status: 400 });
  }

  try {
    await setTicketProvider(auth.user.id, provider as TicketProvider | null);
    return NextResponse.json({ ok: true, ticketProvider: provider });
  } catch (err) {
    console.error(JSON.stringify({ event: "ticket_provider_save_error", message: err instanceof Error ? err.message : String(err) }));
    return NextResponse.json({ error: "Could not save that setting." }, { status: 500 });
  }
}
