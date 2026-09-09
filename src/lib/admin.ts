import "server-only";

/**
 * Owner accounts see internal numbers (what each meeting costs us in vendor
 * fees). Customers never do. Set OWNER_EMAILS in the environment, comma
 * separated. Empty means nobody, which is the safe default.
 */
export function isOwnerEmail(email: string | null | undefined): boolean {
  const list = (process.env.OWNER_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  const e = (email ?? "").trim().toLowerCase();
  return !!e && list.includes(e);
}
