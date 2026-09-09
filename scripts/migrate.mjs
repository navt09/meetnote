// Applies supabase/migrations/*.sql in order, once each.
// Usage: node scripts/migrate.mjs   (reads SUPABASE_DB_URL from .env.local)

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function loadEnvLocal() {
  const p = join(root, ".env.local");
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
loadEnvLocal();

const url = process.env.SUPABASE_DB_URL;
if (!url) {
  console.error("SUPABASE_DB_URL is not set. Add it to .env.local (Supabase > Connect > connection string).");
  process.exit(1);
}

const dir = join(root, "supabase", "migrations");
const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  await client.query(`create table if not exists public._migrations (name text primary key, applied_at timestamptz not null default now())`);
  const { rows } = await client.query(`select name from public._migrations`);
  const done = new Set(rows.map((r) => r.name));
  for (const f of files) {
    if (done.has(f)) {
      console.log(`skip   ${f}`);
      continue;
    }
    const sql = readFileSync(join(dir, f), "utf8");
    await client.query("begin");
    try {
      await client.query(sql);
      await client.query(`insert into public._migrations (name) values ($1)`, [f]);
      await client.query("commit");
      console.log(`applied ${f}`);
    } catch (err) {
      await client.query("rollback");
      console.error(`FAILED ${f}: ${err.message}`);
      process.exit(1);
    }
  }
} finally {
  await client.end();
}
