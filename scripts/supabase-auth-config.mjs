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

const SITE_URL = "https://meetnote-navt1.vercel.app";
const REDIRECTS = [
  `${SITE_URL}/**`,
  // Vercel gives every deployment its own hostname; allow those too.
  "https://fromthecall-*-navt1.vercel.app/**",
  "http://localhost:3000/**",
];

const wanted = {
  site_url: SITE_URL,
  uri_allow_list: REDIRECTS.join(","),
  // Match the client-side rule in src/lib/auth-errors.ts.
  password_min_length: 8,
};

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
console.log("current:");
for (const k of Object.keys(wanted)) console.log(`  ${k}: ${JSON.stringify(before[k])}`);
console.log("wanted:");
for (const [k, v] of Object.entries(wanted)) console.log(`  ${k}: ${JSON.stringify(v)}`);

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
  const good = after[k] === v;
  ok &&= good;
  console.log(`  ${good ? "OK " : "BAD"} ${k}: ${JSON.stringify(after[k])}`);
}
console.log(`\nAlso note: rate_limit_email_sent = ${after.rate_limit_email_sent} auth emails/hour, smtp_host = ${JSON.stringify(after.smtp_host)}.`);
if (!after.smtp_host) console.log("Built-in mailer only delivers to your Supabase team's addresses. Add custom SMTP before other people sign up.");
process.exit(ok ? 0 : 1);
