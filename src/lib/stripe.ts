import "server-only";
import Stripe from "stripe";

/**
 * The Stripe client, built per call rather than at module load.
 *
 * Building it at import time would throw on a server with no key set, which is
 * every environment before billing is switched on, and would take the whole
 * app down rather than just the routes that need it.
 */
export function stripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
  return new Stripe(key);
}
