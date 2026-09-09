// Applies supabase/migrations/*.sql in order, once each.
//
//   npm run migrate
//
// Two transports, tried in this order:
//   1. SUPABASE_ACCESS_TOKEN  -> Supabase Management API (no database password needed)
//   2. SUPABASE_DB_URL        -> direct Postgres connection
// Applied files are recorded in public._migrations so re-running is safe.

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function loadEnvLocal() {
  const p = join(root, ".env.local");
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
}
loadEnvLocal();

const dir = join(root, "supabase", "migrations");
const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();

/** Management API transport. */
function apiRunner(token, ref) {
  return async function run(sql) {
    const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query: sql }),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`${res.status}: ${text.slice(0, 400)}`);
    try {
      return JSON.parse(text);
    } catch {
      return [];
    }
  };
}

/** Direct Postgres transport. */
async function pgRunner(url) {
  const { default: pg } = await import("pg");
  const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();
  const run = async (sql) => (await client.query(sql)).rows;
  run.close = () => client.end();
  return run;
}

const token = process.env.SUPABASE_ACCESS_TOKEN;
const projectRef = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").match(/https:\/\/([^.]+)\./)?.[1];
const dbUrl = process.env.SUPABASE_DB_URL;

let run;
if (token && projectRef) {
  console.log(`transport: Management API (project ${projectRef})`);
  run = apiRunner(token, projectRef);
} else if (dbUrl) {
  console.log("transport: direct Postgres connection");
  run = await pgRunner(dbUrl);
} else {
  console.error("Set SUPABASE_ACCESS_TOKEN (with NEXT_PUBLIC_SUPABASE_URL) or SUPABASE_DB_URL in .env.local");
  process.exit(1);
}

try {
  await run(`create table if not exists public._migrations (name text primary key, applied_at timestamptz not null default now())`);
  const rows = await run(`select name from public._migrations`);
  const done = new Set((rows ?? []).map((r) => r.name));

  let applied = 0;
  for (const f of files) {
    if (done.has(f)) {
      console.log(`skip    ${f}`);
      continue;
    }
    const sql = readFileSync(join(dir, f), "utf8");
    try {
      // The API runs each request in its own transaction already; wrapping the
      // file keeps the direct-Postgres path atomic too.
      await run(`begin;\n${sql}\ninsert into public._migrations (name) values ('${f.replace(/'/g, "''")}');\ncommit;`);
      console.log(`applied ${f}`);
      applied++;
    } catch (err) {
      await run("rollback").catch(() => {});
      console.error(`FAILED  ${f}\n${err.message}`);
      process.exitCode = 1;
      break;
    }
  }
  if (!process.exitCode) console.log(applied === 0 ? "nothing to do; schema is up to date" : `done, ${applied} migration(s) applied`);
} finally {
  await run.close?.();
}
