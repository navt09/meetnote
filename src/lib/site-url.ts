import "server-only";

/**
 * Where to send someone back to after Stripe.
 *
 * Prefers an explicitly configured origin, because a redirect target read from
 * request headers is a redirect target an attacker can suggest. The header is
 * only a fallback for local development, where nothing is configured.
 */
export function siteOrigin(req: Request): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (configured) return configured.replace(/\/$/, "");
  return new URL(req.url).origin;
}
