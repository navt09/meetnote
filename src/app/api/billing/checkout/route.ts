import { NextResponse } from "next/server";
import { isBlocked, requireSignedIn } from "@/lib/guard";
import { stripe } from "@/lib/stripe";
import { stripeConfigured } from "@/lib/billing";
import { billingFor, rememberCustomer } from "@/lib/billing-store";
import { publicErrorMessage } from "@/lib/public-error";
import { siteOrigin } from "@/lib/site-url";

export const runtime = "nodejs";

/**
 * Starts a payment. Returns the Stripe Checkout URL for the browser to follow.
 *
 * Nothing here grants anything. Checkout finishing is not proof of payment,
 * and the page someone lands on afterwards is just a page: the tier only moves
 * when the webhook says the subscription is real.
 */
export async function POST(req: Request) {
  const gate = await requireSignedIn(req);
  if (isBlocked(gate)) return gate;
  const { auth, tier } = gate;

  if (!stripeConfigured()) {
    return NextResponse.json({ error: "Payments aren't set up on this server yet." }, { status: 503 });
  }
  if (tier !== "free") {
    // Already paying, or the owner. Sending them to checkout would create a
    // second subscription for the same account.
    return NextResponse.json({ error: "This account is already on Pro." }, { status: 409 });
  }

  try {
    const client = stripe();
    const existing = await billingFor(auth.user.id);

    // Reuse the customer if there is one, so somebody who subscribed, cancelled
    // and came back keeps one billing history rather than collecting customers.
    let customerId = existing?.stripeCustomerId ?? null;
    if (!customerId) {
      const customer = await client.customers.create({
        email: auth.user.email ?? undefined,
        // The link back. The webhook still looks the account up by customer id;
        // this is here for anyone reading the Stripe dashboard.
        metadata: { user_id: auth.user.id },
      });
      customerId = customer.id;
      await rememberCustomer(auth.user.id, customerId);
    }

    const origin = siteOrigin(req);
    const session = await client.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: process.env.STRIPE_PRICE_ID!, quantity: 1 }],
      client_reference_id: auth.user.id,
      subscription_data: { metadata: { user_id: auth.user.id } },
      success_url: `${origin}/settings?checkout=done`,
      cancel_url: `${origin}/settings?checkout=cancelled`,
      allow_promotion_codes: true,
    });

    if (!session.url) throw new Error("Stripe returned a session with no URL");
    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error(JSON.stringify({ event: "checkout_error", raw: err instanceof Error ? err.message : String(err) }));
    return NextResponse.json({ error: publicErrorMessage(err) }, { status: 502 });
  }
}
