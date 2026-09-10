import "server-only";
import { supabaseAdmin } from "./supabase-admin";
import { tierForSubscription } from "./billing";
import type { Tier } from "./account";

/**
 * The account row's billing side. Service role, because the accounts table
 * gives users SELECT and nothing else: no request a signed-in person makes can
 * change what they are paying for.
 */

export type BillingRow = {
  tier: Tier;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  subscriptionStatus: string | null;
};

export async function billingFor(userId: string): Promise<BillingRow | null> {
  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from("accounts")
    .select("tier,stripe_customer_id,stripe_subscription_id,subscription_status")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    console.error(JSON.stringify({ event: "billing_read_error", message: error.message }));
    return null;
  }
  if (!data) return null;
  const row = data as {
    tier: Tier;
    stripe_customer_id: string | null;
    stripe_subscription_id: string | null;
    subscription_status: string | null;
  };
  return {
    tier: row.tier,
    stripeCustomerId: row.stripe_customer_id,
    stripeSubscriptionId: row.stripe_subscription_id,
    subscriptionStatus: row.subscription_status,
  };
}

/** Which account a Stripe customer belongs to. How a webhook finds its user. */
export async function userIdForCustomer(customerId: string): Promise<string | null> {
  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from("accounts")
    .select("user_id")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();
  if (error) {
    console.error(JSON.stringify({ event: "billing_customer_lookup_error", message: error.message }));
    return null;
  }
  return (data as { user_id: string } | null)?.user_id ?? null;
}

/** Remembers the Stripe customer for an account, so nobody becomes two customers. */
export async function rememberCustomer(userId: string, customerId: string): Promise<void> {
  const admin = supabaseAdmin();
  const { error } = await admin
    .from("accounts")
    .upsert({ user_id: userId, stripe_customer_id: customerId }, { onConflict: "user_id" });
  if (error) throw new Error(`Could not save the billing customer: ${error.message}`);
}

/**
 * Applies what Stripe now says about a subscription.
 *
 * Two things this deliberately will not do:
 *
 * It never touches an owner. Owner comes from OWNER_EMAILS and is not for
 * sale, so neither a payment nor a cancellation may move it, and a test
 * account of ours cancelling must not lock us out of our own product.
 *
 * It never reads the status from the event body. Stripe retries webhooks and
 * does not promise order, so an old "past_due" arriving after a new "active"
 * would otherwise downgrade someone who had just paid. The caller re-reads the
 * subscription from Stripe first and passes what is true now.
 */
export async function applySubscription(
  userId: string,
  input: { subscriptionId: string | null; status: string | null; customerId?: string | null },
): Promise<{ tier: Tier; changed: boolean } | null> {
  const admin = supabaseAdmin();
  const current = await billingFor(userId);

  if (current?.tier === "owner") {
    console.log(JSON.stringify({ event: "billing_owner_untouched", userId }));
    return { tier: "owner", changed: false };
  }

  const tier = tierForSubscription(input.status);
  const { error } = await admin.from("accounts").upsert(
    {
      user_id: userId,
      tier,
      stripe_subscription_id: input.subscriptionId,
      subscription_status: input.status,
      ...(input.customerId ? { stripe_customer_id: input.customerId } : {}),
      note: `stripe ${input.status ?? "none"}`,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (error) throw new Error(`Could not apply the subscription: ${error.message}`);

  const changed = current?.tier !== tier;
  console.log(JSON.stringify({ event: "billing_applied", userId, status: input.status, tier, changed }));
  return { tier, changed };
}
