// Applies fromthecall's Supabase Auth URL settings, so sign-in links land on the
// right site instead of localhost.
//
//   node scripts/supabase-auth-config.mjs          # show current vs wanted
//   node scripts/supabase-auth-config.mjs --apply  # write the changes
//
// Needs SUPABASE_ACCESS_TOKEN in .env.local.

import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
for (const line of existsSync(join(root, ".env.local")) ? readFileSync(join(root, ".env.local"), "utf8").split(/\r?\n/) : []) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}

// The apex is canonical: Vercel 308s www to it, and the four OAuth callback
// URLs are registered against the apex. A Site URL that disagreed with that
// would send every magic link through a redirect.
const SITE_URL = "https://fromthecall.com";
const REDIRECTS = [
  `${SITE_URL}/**`,
  // The www host redirects to the apex, but a link that lands there first
  // still has to be allowed or it is refused before the redirect happens.
  "https://www.fromthecall.com/**",
  // The Vercel hostname still works and is worth keeping while the domain settles.
  "https://meetnote-navt1.vercel.app/**",
  // Vercel gives every deployment its own hostname; allow those too.
  "https://meetnote-*-navt1.vercel.app/**",
  "http://localhost:3000/**",
];

const wanted = {
  site_url: SITE_URL,
  uri_allow_list: REDIRECTS.join(","),
  // Match the client-side rule in src/lib/auth-errors.ts.
  password_min_length: 8,
};

/**
 * Custom SMTP, applied only when RESEND_API_KEY is set.
 *
 * Supabase's built-in mailer sends at most a couple of auth emails an hour and
 * only to the project team's own addresses, so until this is configured nobody
 * outside the team can actually sign up: their confirmation mail is never
 * delivered and the failure looks like a broken form rather than a limit.
 *
 * Resend's SMTP username really is the word "resend"; the API key is the
 * password. Getting that the other way round produces an authentication error
 * that reads as a bad key.
 *
 * Port 587 rather than 465: Supabase's sender uses STARTTLS, and 465 expects
 * TLS from the first byte, so it hangs rather than failing usefully.
 */
const SMTP_SENDER = "hello@fromthecall.com";
if (process.env.RESEND_API_KEY) {
  Object.assign(wanted, {
    smtp_host: "smtp.resend.com",
    smtp_port: 587,
    smtp_user: "resend",
    smtp_pass: process.env.RESEND_API_KEY,
    smtp_sender_name: "From the Call",
    smtp_admin_email: SMTP_SENDER,
    // Both default to 1 with custom SMTP, which is about a quarter of what a
    // person signing up, mistyping their password and asking for a reset
    // actually needs.
    rate_limit_email_sent: 30,
  });
}

const token = process.env.SUPABASE_ACCESS_TOKEN;
const ref = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").match(/https:\/\/([^.]+)\./)?.[1];
if (!token || !ref) {
  console.error("Set SUPABASE_ACCESS_TOKEN and NEXT_PUBLIC_SUPABASE_URL in .env.local");
  process.exit(1);
}
const base = `https://api.supabase.com/v1/projects/${ref}/config/auth`;
const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

async function get() {
  const res = await fetch(base, { headers });
  if (!res.ok) throw new Error(`GET auth config: ${res.status} ${await res.text()}`);
  return res.json();
}

const before = await get();
// The API key is a secret and this prints to a terminal and to CI logs.
const shown = (k, v) => (k === "smtp_pass" ? (v ? `"set, ${String(v).length} chars"` : "null") : JSON.stringify(v));
console.log("current:");
for (const k of Object.keys(wanted)) console.log(`  ${k}: ${shown(k, before[k])}`);
console.log("wanted:");
for (const [k, v] of Object.entries(wanted)) console.log(`  ${k}: ${shown(k, v)}`);
if (!process.env.RESEND_API_KEY) {
  console.log("\n(no RESEND_API_KEY, so SMTP is left alone. Supabase\'s own mailer only delivers to your project team.)");
}

if (!process.argv.includes("--apply")) {
  console.log("\nDry run. Re-run with --apply to write these.");
  process.exit(0);
}

const res = await fetch(base, { method: "PATCH", headers, body: JSON.stringify(wanted) });
if (!res.ok) {
  console.error(`PATCH failed: ${res.status} ${(await res.text()).slice(0, 400)}`);
  process.exit(1);
}
const after = await get();
console.log("\napplied:");
let ok = true;
for (const [k, v] of Object.entries(wanted)) {
  // Supabase never returns the password it stored, so it cannot be compared;
  // whether mail actually sends is the only real test of it.
  const good = k === "smtp_pass" ? !!after.smtp_host : after[k] === v;
  ok &&= good;
  console.log(`  ${good ? "OK " : "BAD"} ${k}: ${shown(k, after[k])}`);
}
console.log(`\nAlso note: rate_limit_email_sent = ${after.rate_limit_email_sent} auth emails/hour, smtp_host = ${JSON.stringify(after.smtp_host)}.`);
if (!after.smtp_host) console.log("Built-in mailer only delivers to your Supabase team's addresses. Add custom SMTP before other people sign up.");
process.exit(ok ? 0 : 1);
