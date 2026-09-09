import { supabaseServer } from "@/lib/supabase/server";
import { credentialsKeyConfigured } from "@/lib/crypto";
import { googleConfigured } from "@/lib/providers/google";
import { linearOAuthConfigured } from "@/lib/providers/linear-oauth";
import { jiraOAuthConfigured } from "@/lib/providers/jira-oauth";
import { slackOAuthConfigured } from "@/lib/providers/slack-oauth";
import { tierFor } from "@/lib/account-store";
import { toPublicConnector, type ConnectorRow, type TicketProvider } from "@/lib/connectors";
import SettingsView from "./settings-view";

export const dynamic = "force-dynamic";
export const metadata = { title: "Settings · Meetnote" };

export default async function SettingsPage() {
  const db = await supabaseServer();
  const { data: userData } = await db.auth.getUser();

  const [connectorsRes, settingsRes, tier] = await Promise.all([
    db.from("connectors").select("provider,config,last_error,created_at"),
    db.from("user_settings").select("ticket_provider").maybeSingle(),
    userData.user ? tierFor(userData.user.id, userData.user.email) : Promise.resolve("free" as const),
  ]);

  const connectors = ((connectorsRes.data ?? []) as ConnectorRow[]).map(toPublicConnector);
  const ticketProvider = ((settingsRes.data as { ticket_provider: TicketProvider | null } | null)?.ticket_provider) ?? null;

  return (
    <SettingsView
      initial={connectors}
      initialTicketProvider={ticketProvider}
      storageReady={credentialsKeyConfigured()}
      googleReady={googleConfigured()}
      oauthReady={{
        linear: linearOAuthConfigured(),
        jira: jiraOAuthConfigured(),
        slack: slackOAuthConfigured(),
      }}
      tier={tier}
      email={userData.user?.email ?? null}
    />
  );
}
