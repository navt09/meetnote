import "server-only";
import { supabaseAdmin } from "./supabase-admin";
import { isTier, type Tier } from "./account";

/**
 * The operator's view of every account, and what each one costs to run.
 *
 * Lives here rather than in the route so the page can render the first list on
 * the server, and the route can serve refreshes, from one implementation.
 */

export type OwnerAccount = {
  userId: string;
  email: string | null;
  tier: Tier;
  note: string | null;
  createdAt: string;
  lastSignInAt: string | null;
  meetings: number;
  costUsd: number;
};

/**
 * Deliberately joins in the application rather than the database: auth.users is
 * not reachable from PostgREST, so the user list has to come from the admin API
 * and be stitched to the public tables here.
 */
export async function listAccounts(): Promise<OwnerAccount[]> {
  const admin = supabaseAdmin();

  const [usersRes, accountsRes, meetingsRes] = await Promise.all([
    admin.auth.admin.listUsers({ perPage: 1000 }),
    admin.from("accounts").select("user_id,tier,note"),
    admin.from("meetings").select("user_id,transcription_cost_usd,llm_cost_usd"),
  ]);

  if (usersRes.error) throw new Error(usersRes.error.message);

  const tiers = new Map<string, { tier: string; note: string | null }>();
  for (const a of (accountsRes.data ?? []) as { user_id: string; tier: string; note: string | null }[]) {
    tiers.set(a.user_id, { tier: a.tier, note: a.note });
  }

  const usage = new Map<string, { meetings: number; costUsd: number }>();
  for (const m of (meetingsRes.data ?? []) as {
    user_id: string;
    transcription_cost_usd: number | null;
    llm_cost_usd: number | null;
  }[]) {
    const prev = usage.get(m.user_id) ?? { meetings: 0, costUsd: 0 };
    prev.meetings += 1;
    prev.costUsd += Number(m.transcription_cost_usd ?? 0) + Number(m.llm_cost_usd ?? 0);
    usage.set(m.user_id, prev);
  }

  const accounts: OwnerAccount[] = usersRes.data.users.map((u) => {
    const row = tiers.get(u.id);
    const stored = row?.tier ?? "free";
    const seen = usage.get(u.id) ?? { meetings: 0, costUsd: 0 };
    return {
      userId: u.id,
      email: u.email ?? null,
      tier: isTier(stored) ? stored : "free",
      note: row?.note ?? null,
      createdAt: u.created_at,
      lastSignInAt: u.last_sign_in_at ?? null,
      meetings: seen.meetings,
      // Fractions of a cent are real here: one short meeting costs well under a penny.
      costUsd: Math.round(seen.costUsd * 10000) / 10000,
    };
  });

  // Newest first, so a fresh sign-up is the first thing the owner sees.
  accounts.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  return accounts;
}
