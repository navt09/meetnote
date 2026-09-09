import "server-only";
import { supabaseAdmin } from "./supabase-admin";
import { isTier, type Tier } from "./account";

/**
 * Reading and writing account tiers. Uses the service role: the accounts table
 * gives users SELECT only, so nothing a signed-in user sends can change their
 * own tier.
 */

/** Emails that are always owner, regardless of what the row says. */
function ownerEmails(): string[] {
  return (process.env.OWNER_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * The caller's tier, creating the row on first sight.
 *
 * An address in OWNER_EMAILS is owner even if the row says otherwise, so the
 * owner can never be locked out of their own product by a bad row.
 */
export async function tierFor(userId: string, email: string | null | undefined): Promise<Tier> {
  const isOwner = !!email && ownerEmails().includes(email.trim().toLowerCase());
  const admin = supabaseAdmin();

  const { data, error } = await admin.from("accounts").select("tier").eq("user_id", userId).maybeSingle();
  if (error) {
    console.error(JSON.stringify({ event: "tier_read_error", message: error.message }));
    // Fail closed for everyone except the owner.
    return isOwner ? "owner" : "free";
  }

  if (!data) {
    const tier: Tier = isOwner ? "owner" : "free";
    await admin.from("accounts").insert({ user_id: userId, tier, note: isOwner ? "owner by email" : "new sign-up" });
    return tier;
  }

  const stored = (data as { tier: string }).tier;
  if (isOwner) {
    if (stored !== "owner") await admin.from("accounts").update({ tier: "owner", note: "owner by email" }).eq("user_id", userId);
    return "owner";
  }
  return isTier(stored) ? stored : "free";
}

export async function setTier(userId: string, tier: Tier, note?: string): Promise<void> {
  const admin = supabaseAdmin();
  const { error } = await admin.from("accounts").upsert({ user_id: userId, tier, note: note ?? null }, { onConflict: "user_id" });
  if (error) throw new Error(`Could not set the tier: ${error.message}`);
}
