import { supabaseServer } from "@/lib/supabase/server";
import { credentialsKeyConfigured } from "@/lib/crypto";
import { googleConfigured } from "@/lib/providers/google";
import { linearOAuthConfigured } from "@/lib/providers/linear-oauth";
import { jiraOAuthConfigured } from "@/lib/providers/jira-oauth";
import { slackOAuthConfigured } from "@/lib/providers/slack-oauth";
import { tierFor } from "@/lib/account-store";
import { toPublicConnector, type ConnectorRow, type TicketProvider } from "@/lib/connectors";
import { cleanTheme } from "@/lib/settings-store";
import { stripeConfigured } from "@/lib/billing";
import { billingFor } from "@/lib/billing-store";
import SettingsView, { type CheckoutOutcome } from "./settings-view";

export const dynamic = "force-dynamic";
export const metadata = { title: "Settings · From the Call" };

/** Only the two values checkout can send back. Anything else is a crafted link. */
function checkoutOutcome(value: string | string[] | undefined): CheckoutOutcome {
  return value === "done" || value === "cancelled" ? value : null;
}

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const db = await supabaseServer();
  const { data: userData } = await db.auth.getUser();

  const [connectorsRes, settingsRes, tier, billing, query] = await Promise.all([
    db.from("connectors").select("provider,config,last_error,created_at"),
    db.from("user_settings").select("ticket_provider,display_name,theme").maybeSingle(),
    userData.user ? tierFor(userData.user.id, userData.user.email) : Promise.resolve("free" as const),
    userData.user ? billingFor(userData.user.id) : Promise.resolve(null),
    searchParams,
  ]);

  const connectors = ((connectorsRes.data ?? []) as ConnectorRow[]).map(toPublicConnector);
  const ticketProvider = ((settingsRes.data as { ticket_provider: TicketProvider | null } | null)?.ticket_provider) ?? null;
  const displayName = ((settingsRes.data as { display_name?: string | null } | null)?.display_name) ?? null;
  const theme = cleanTheme((settingsRes.data as { theme?: unknown } | null)?.theme) ?? "dark";

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
      paymentsReady={stripeConfigured()}
      subscriptionStatus={billing?.subscriptionStatus ?? null}
      hasStripeCustomer={!!billing?.stripeCustomerId}
      checkout={checkoutOutcome(query.checkout)}
      email={userData.user?.email ?? null}
      displayName={displayName}
      theme={theme}
    />
  );
}
