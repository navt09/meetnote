import "server-only";
import { supabaseAdmin } from "./supabase-admin";
import { decryptJson, encryptJson } from "./crypto";
import type { ConnectorConfig, ConnectorRow, Credentials, Provider, TicketProvider } from "./connectors";
import type { DestinationContext } from "./draft-destination";

/**
 * Reading and writing connector credentials. Uses the service role because the
 * encrypted blob must never be selectable by the browser; every call takes an
 * explicit userId and filters on it.
 */

export type LoadedConnector<C extends Credentials, K extends ConnectorConfig> = {
  credentials: C;
  config: K;
  lastError: string | null;
};

export async function saveConnector(
  userId: string,
  provider: Provider,
  credentials: Credentials,
  config: ConnectorConfig = {},
): Promise<void> {
  const admin = supabaseAdmin();
  const { error } = await admin
    .from("connectors")
    .upsert(
      { user_id: userId, provider, credentials: encryptJson(credentials), config, last_error: null },
      { onConflict: "user_id,provider" },
    );
  if (error) throw new Error(`Could not save the connection: ${error.message}`);
}

/** Updates only the visible settings, leaving the stored secret alone. */
export async function updateConnectorConfig(userId: string, provider: Provider, config: ConnectorConfig): Promise<void> {
  const admin = supabaseAdmin();
  const { error } = await admin.from("connectors").update({ config }).eq("user_id", userId).eq("provider", provider);
  if (error) throw new Error(`Could not update the connection: ${error.message}`);
}

export async function loadConnector<C extends Credentials, K extends ConnectorConfig>(
  userId: string,
  provider: Provider,
): Promise<LoadedConnector<C, K> | null> {
  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from("connectors")
    .select("credentials,config,last_error")
    .eq("user_id", userId)
    .eq("provider", provider)
    .maybeSingle();
  if (error) throw new Error(`Could not read the connection: ${error.message}`);
  if (!data) return null;

  const row = data as Pick<ConnectorRow, "credentials" | "config" | "last_error">;
  try {
    return { credentials: decryptJson<C>(row.credentials), config: (row.config ?? {}) as K, lastError: row.last_error };
  } catch (err) {
    // A key rotation or a corrupt row: treat as not connected rather than crashing.
    console.error(JSON.stringify({ event: "connector_decrypt_failed", provider, message: err instanceof Error ? err.message : String(err) }));
    return null;
  }
}

export async function deleteConnector(userId: string, provider: Provider): Promise<void> {
  const admin = supabaseAdmin();
  const { error } = await admin.from("connectors").delete().eq("user_id", userId).eq("provider", provider);
  if (error) throw new Error(`Could not disconnect: ${error.message}`);
}

/** Records that a provider call failed, so the settings page can prompt a reconnect. */
export async function noteConnectorError(userId: string, provider: Provider, message: string | null): Promise<void> {
  const admin = supabaseAdmin();
  await admin
    .from("connectors")
    .update({ last_error: message, last_used_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("provider", provider);
}

export async function getTicketProvider(userId: string): Promise<TicketProvider | null> {
  const admin = supabaseAdmin();
  const { data } = await admin.from("user_settings").select("ticket_provider").eq("user_id", userId).maybeSingle();
  return ((data as { ticket_provider: TicketProvider | null } | null)?.ticket_provider) ?? null;
}

/**
 * Everything needed to work out where a draft could go: what is connected, and
 * the account-wide preference that is now only a tie-breaker rather than the
 * decision. Both, because connecting without choosing and choosing without
 * connecting are different problems with different fixes.
 *
 * Two reads rather than a join: `user_settings` and `connectors` are separate
 * tables and this runs on pages already awaiting several things.
 */
export async function destinationContextFor(userId: string): Promise<DestinationContext> {
  const admin = supabaseAdmin();
  const [settings, rows] = await Promise.all([
    admin.from("user_settings").select("ticket_provider").eq("user_id", userId).maybeSingle(),
    admin.from("connectors").select("provider,config").eq("user_id", userId),
  ]);
  const preferred = ((settings.data as { ticket_provider: TicketProvider | null } | null)?.ticket_provider) ?? null;
  const all = (rows.data ?? []) as { provider: string; config: { scopes?: string[] } | null }[];
  const connected = all.map((r) => r.provider) as Provider[];
  // Microsoft is one row covering several products, so what it can do is in
  // the scopes rather than in the row existing. `config` holds no secrets;
  // the credentials are a separate encrypted column.
  const ms = all.find((r) => r.provider === "microsoft")?.config as { scopes?: string[]; channelId?: string } | undefined;
  return { connected, preferred, microsoftScopes: ms?.scopes ?? [], teamsChannelChosen: !!ms?.channelId };
}

export async function setTicketProvider(userId: string, provider: TicketProvider | null): Promise<void> {
  const admin = supabaseAdmin();
  const { error } = await admin.from("user_settings").upsert({ user_id: userId, ticket_provider: provider }, { onConflict: "user_id" });
  if (error) throw new Error(`Could not save that setting: ${error.message}`);
}
