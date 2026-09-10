import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { stripeWebhookConfigured } from "@/lib/billing";
import { applySubscription, userIdForCustomer } from "@/lib/billing-store";

export const runtime = "nodejs";
// The signature is computed over the exact bytes Stripe sent, so nothing may
// re-encode this request on the way in.
export const dynamic = "force-dynamic";

/**
 * The only thing that moves an account to Pro.
 *
 * Checkout finishing in someone's browser is not proof of payment: the
 * redirect is a URL anyone can visit, and the payment can still fail after it.
 * Stripe telling us server to server, with a signature, is the proof, so this
 * route is the single place the tier changes for money.
 *
 * Everything it does is idempotent. Stripe retries on any non-2xx and does not
 * promise order, so each event ends by asking Stripe what is true *now* rather
 * than trusting the state carried in the event body. An old event arriving
 * late then writes the same answer as the new one instead of undoing it.
 */

/** The events worth acting on. Anything else is acknowledged and ignored. */
const HANDLED = new Set<Stripe.Event["type"]>([
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
]);

function customerIdOf(value: string | Stripe.Customer | Stripe.DeletedCustomer | null): string | null {
  if (!value) return null;
  return typeof value === "string" ? value : value.id;
}

export async function POST(req: Request) {
  if (!stripeWebhookConfigured()) {
    console.error(JSON.stringify({ event: "webhook_unconfigured" }));
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "Unsigned" }, { status: 400 });

  // Raw text, never req.json(): the signature covers the bytes as sent.
  const body = await req.text();

  let event: Stripe.Event;
  try {
    event = await stripe().webhooks.constructEventAsync(body, signature, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (err) {
    // A bad signature is someone posting to this route, not a Stripe problem.
    console.error(JSON.stringify({ event: "webhook_bad_signature", raw: err instanceof Error ? err.message : String(err) }));
    return NextResponse.json({ error: "Bad signature" }, { status: 400 });
  }

  if (!HANDLED.has(event.type)) return NextResponse.json({ received: true });

  try {
    const client = stripe();

    // Both shapes of event carry a customer; that is how the account is found.
    const object = event.data.object as Stripe.Checkout.Session | Stripe.Subscription;
    const customerId = customerIdOf(object.customer ?? null);
    if (!customerId) {
      console.error(JSON.stringify({ event: "webhook_no_customer", type: event.type, id: event.id }));
      return NextResponse.json({ received: true });
    }

    // The account is found by customer id, which we stored when the customer
    // was created. client_reference_id is a fallback for a customer created
    // outside this app, e.g. a subscription started from the Stripe dashboard.
    const fallbackUserId =
      "client_reference_id" in object ? object.client_reference_id : (object.metadata?.user_id ?? null);
    const userId = (await userIdForCustomer(customerId)) ?? fallbackUserId;
    if (!userId) {
      console.error(JSON.stringify({ event: "webhook_unknown_customer", type: event.type, customerId }));
      // 200: retrying will not make this customer belong to an account, and a
      // permanent failure would have Stripe retry it for days.
      return NextResponse.json({ received: true });
    }

    // Ask Stripe what is true now rather than believing an event that may have
    // overtaken another one.
    const subs = await client.subscriptions.list({ customer: customerId, status: "all", limit: 10 });
    const live = subs.data.find((s) => s.status === "active" || s.status === "trialing" || s.status === "past_due");
    const newest = subs.data[0] ?? null;
    const current = live ?? newest;

    await applySubscription(userId, {
      subscriptionId: current?.id ?? null,
      status: current?.status ?? "canceled",
      customerId,
    });

    return NextResponse.json({ received: true });
  } catch (err) {
    // 500 so Stripe retries: a database blip should not silently lose a payment.
    console.error(
      JSON.stringify({ event: "webhook_error", type: event.type, id: event.id, raw: err instanceof Error ? err.message : String(err) }),
    );
    return NextResponse.json({ error: "Could not process" }, { status: 500 });
  }
}
