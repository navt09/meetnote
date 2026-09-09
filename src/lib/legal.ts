/**
 * Shared facts for the public legal pages.
 *
 * The contact address lives in site.ts because the landing page quotes it too,
 * and a privacy policy whose contact bounces is both a failed Google review and
 * a real obligation missed.
 */
export { CONTACT_EMAIL } from "./site";

/** Bump whenever either page changes in a way that affects a reader. */
export const LEGAL_UPDATED = "9 September 2026";
