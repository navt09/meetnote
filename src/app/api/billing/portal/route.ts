import { NextResponse } from "next/server";
import { isBlocked, requireSignedIn } from "@/lib/guard";
import { stripe } from "@/lib/stripe";
import { stripeConfigured } from "@/lib/billing";
import { billingFor } from "@/lib/billing-store";
import { publicErrorMessage } from "@/lib/public-error";
import { siteOrigin } from "@/lib/site-url";

export const runtime = "nodejs";

/**
 * Sends someone to Stripe's own billing portal: change the card, see the
 * invoices, cancel.
 *
 * Cancelling lives there rather than here on purpose. Stripe already handles
 * the end-of-period wind-down and the emails, and a cancel button we wrote
 * would be a second source of truth for whether someone is still paying.
 */
export async function POST(req: Request) {
  const gate = await requireSignedIn(req);
  if (isBlocked(gate)) return gate;
  const { auth } = gate;

  if (!stripeConfigured()) {
    return NextResponse.json({ error: "Payments aren't set up on this server yet." }, { status: 503 });
  }

  const existing = await billingFor(auth.user.id);
  if (!existing?.stripeCustomerId) {
    return NextResponse.json({ error: "There's nothing to manage on this account yet." }, { status: 404 });
  }

  try {
    const session = await stripe().billingPortal.sessions.create({
      customer: existing.stripeCustomerId,
      return_url: `${siteOrigin(req)}/settings`,
    });
    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error(JSON.stringify({ event: "portal_error", raw: err instanceof Error ? err.message : String(err) }));
    return NextResponse.json({ error: publicErrorMessage(err) }, { status: 502 });
  }
}
