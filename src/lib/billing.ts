// What a Stripe subscription means for an account. Pure, and unit-tested:
// the mapping from "what Stripe says" to "what this person may do" is the
// whole of the payment logic, and it is the part worth being sure about.

import type { Tier } from "./account";

/**
 * Every state Stripe reports a subscription in.
 *
 * Listed rather than imported as a loose string so a status nobody thought
 * about is a compile error at the call site, not a silent free account.
 */
export type SubscriptionStatus =
  | "active"
  | "trialing"
  | "past_due"
  | "unpaid"
  | "canceled"
  | "incomplete"
  | "incomplete_expired"
  | "paused";

/**
 * Whether a subscription in this state should be paying for Pro.
 *
 * `past_due` keeps access: the card failed and Stripe is retrying, and cutting
 * someone off mid-retry over a bank blip is a good way to lose a customer who
 * was going to pay. Stripe moves it to `unpaid` or `canceled` once retries are
 * exhausted, and that is where access actually stops.
 *
 * `incomplete` does not grant access: the first payment has not gone through,
 * so nothing has been paid yet. `trialing` does, which is the point of a trial.
 */
export function grantsPro(status: SubscriptionStatus | string | null | undefined): boolean {
  return status === "active" || status === "trialing" || status === "past_due";
}

/**
 * The tier a subscription state implies.
 *
 * Never returns "owner": that comes from OWNER_EMAILS and is not for sale, so
 * a payment can neither grant it nor a cancellation take it away. The caller
 * is responsible for not writing over an owner, and billing-store does.
 */
export function tierForSubscription(status: SubscriptionStatus | string | null | undefined): Exclude<Tier, "owner"> {
  return grantsPro(status) ? "active" : "free";
}

/** True when this server has everything it needs to take a payment. */
export function stripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_PRICE_ID);
}

/** True when a webhook can be trusted. Separate: a server can charge without one, badly. */
export function stripeWebhookConfigured(): boolean {
  return Boolean(process.env.STRIPE_WEBHOOK_SECRET);
}
