import { supabaseServer } from "@/lib/supabase/server";
import { credentialsKeyConfigured } from "@/lib/crypto";
import { googleConfigured } from "@/lib/providers/google";
import { toPublicConnector, type ConnectorRow, type TicketProvider } from "@/lib/connectors";
import SettingsView from "./settings-view";

export const dynamic = "force-dynamic";
export const metadata = { title: "Settings · Meetnote" };

export default async function SettingsPage() {
  const db = await supabaseServer();
  const [connectorsRes, settingsRes] = await Promise.all([
    db.from("connectors").select("provider,config,last_error,created_at"),
    db.from("user_settings").select("ticket_provider").maybeSingle(),
  ]);

  const connectors = ((connectorsRes.data ?? []) as ConnectorRow[]).map(toPublicConnector);
  const ticketProvider = ((settingsRes.data as { ticket_provider: TicketProvider | null } | null)?.ticket_provider) ?? null;

  return (
    <SettingsView
      initial={connectors}
      initialTicketProvider={ticketProvider}
      storageReady={credentialsKeyConfigured()}
      googleReady={googleConfigured()}
    />
  );
}
