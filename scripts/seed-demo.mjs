// Creates a demo account with one finished meeting, so the UI can be looked at
// with real content. Development only.
//
//   node scripts/seed-demo.mjs [baseUrl] [audioFile]   # create, print credentials
//   node scripts/seed-demo.mjs --clean                 # delete every demo account
//
// Demo accounts use the demo-*@fromthecall.invalid pattern and can't receive email.

import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
for (const line of existsSync(join(root, ".env.local")) ? readFileSync(join(root, ".env.local"), "utf8").split(/\r?\n/) : []) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_ || !ANON || !SERVICE) {
  console.error("Missing Supabase env vars in .env.local");
  process.exit(1);
}
const admin = createClient(URL_, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
const anon = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });

if (process.argv.includes("--clean")) {
  const { data, error } = await admin.auth.admin.listUsers({ perPage: 200 });
  if (error) throw error;
  let n = 0;
  for (const u of data.users) {
    if (u.email?.startsWith("demo-") && u.email.endsWith("@fromthecall.invalid")) {
      // Storage is not covered by the database cascade, so clear it explicitly.
      const paths = [];
      const { data: months } = await admin.storage.from("recordings").list(u.id, { limit: 1000 });
      for (const month of months ?? []) {
        const { data: files } = await admin.storage.from("recordings").list(`${u.id}/${month.name}`, { limit: 1000 });
        for (const f of files ?? []) paths.push(`${u.id}/${month.name}/${f.name}`);
      }
      if (paths.length) await admin.storage.from("recordings").remove(paths);
      await admin.from("meetings").delete().eq("user_id", u.id);
      await admin.auth.admin.deleteUser(u.id);
      console.log(`  removed ${u.email} (${paths.length} audio file(s))`);
      n++;
    }
  }
  console.log(`removed ${n} demo account(s)`);
  process.exit(0);
}

const BASE = (process.argv[2] ?? "http://localhost:3000").replace(/\/$/, "");
const AUDIO = process.argv[3] ?? "C:/Users/navee/AppData/Local/Temp/mn/standup.wav";
const email = `demo-${Date.now()}@fromthecall.invalid`;
const password = "demo-password-1234";

const { data: newUser, error: cuErr } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
if (cuErr) throw new Error(`createUser: ${cuErr.message}`);

// New accounts start on the free tier, which cannot record or use the AI.
// A demo account needs to actually exercise the pipeline.
const { error: tierErr } = await admin
  .from("accounts")
  .upsert({ user_id: newUser.user.id, tier: "active", note: "demo account" }, { onConflict: "user_id" });
if (tierErr) throw new Error(`set tier: ${tierErr.message}`);
const { data: sess, error: sErr } = await anon.auth.signInWithPassword({ email, password });
if (sErr) throw new Error(`signIn: ${sErr.message}`);
const token = sess.session.access_token;

const api = async (path, init = {}) => {
  const res = await fetch(`${BASE}${path}`, { ...init, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(init.headers ?? {}) } });
  return { status: res.status, json: await res.json().catch(() => ({})) };
};

const audio = readFileSync(AUDIO);
const mime = AUDIO.endsWith(".wav") ? "audio/wav" : "audio/webm";
const created = await api("/api/meetings", { method: "POST", body: JSON.stringify({ mimeType: mime, bytes: audio.length, durationSeconds: 40, recordedAt: new Date().toISOString() }) });
if (created.status !== 201) throw new Error(`create: ${created.status} ${JSON.stringify(created.json)}`);
const put = await fetch(created.json.signedUrl, { method: "PUT", headers: { "Content-Type": mime, "x-upsert": "true" }, body: audio });
if (!put.ok) throw new Error(`upload: ${put.status}`);
await api(`/api/meetings/${created.json.meetingId}/process`, { method: "POST", body: "{}" });

process.stdout.write("processing");
for (let i = 0; i < 60; i++) {
  await new Promise((r) => setTimeout(r, 3000));
  const got = await api(`/api/meetings/${created.json.meetingId}`);
  process.stdout.write(".");
  if (got.json.meeting?.status === "done" || got.json.meeting?.status === "error") {
    console.log(`\nstatus: ${got.json.meeting.status}`);
    break;
  }
}

console.log(`\nDemo account ready at ${BASE}/login`);
console.log(`  email:    ${email}`);
console.log(`  password: ${password}`);
console.log(`  meeting:  ${BASE}/meetings/${created.json.meetingId}`);
console.log("\nRemove all demo accounts later with: node scripts/seed-demo.mjs --clean");
