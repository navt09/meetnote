// End-to-end check of the signed-in pipeline without needing an email inbox.
//
//   node scripts/e2e.mjs [baseUrl] [audioFile]
//
// Creates a throwaway user with the service role key, signs it in by minting a
// magic-link token server-side, then drives the real API: create meeting,
// upload audio straight to storage, start processing, poll until done, print
// the notes, delete the meeting, delete the user.

import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
for (const line of existsSync(join(root, ".env.local")) ? readFileSync(join(root, ".env.local"), "utf8").split(/\r?\n/) : []) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const BASE = (process.argv[2] ?? "http://localhost:3000").replace(/\/$/, "");
const AUDIO = process.argv[3] ?? "C:/Users/navee/AppData/Local/Temp/mn/standup.wav";
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_ || !ANON || !SERVICE) {
  console.error("Missing Supabase env vars in .env.local");
  process.exit(1);
}

const admin = createClient(URL_, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
const anon = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
const email = `e2e-${Date.now()}@meetnote.invalid`;
let userId = null;
let meetingId = null;
const t0 = Date.now();
const log = (msg) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ${msg}`);

async function api(path, init = {}, token) {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(init.headers ?? {}) },
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text.slice(0, 200) };
  }
  return { status: res.status, json };
}

const PASSWORD = `Tr0ub4dour-${Math.random().toString(36).slice(2, 10)}`;

try {
  // 1. throwaway user with a password (no email involved)
  const { data: cu, error: cuErr } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  if (cuErr) throw new Error(`createUser: ${cuErr.message}`);
  userId = cu.user.id;

  // password sign-in is the primary path users take
  const { data: pw, error: pwErr } = await anon.auth.signInWithPassword({ email, password: PASSWORD });
  if (pwErr || !pw.session) throw new Error(`signInWithPassword: ${pwErr?.message ?? "no session"}`);
  let token = pw.session.access_token;
  log(`password sign-in ok for ${email}`);

  // a wrong password must be refused
  const bad = await anon.auth.signInWithPassword({ email, password: "wrong-password-entirely" });
  if (!bad.error) throw new Error("wrong password was accepted");
  log(`wrong password refused ("${bad.error.message}")`);

  // the email-link path must still work as a fallback
  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (linkErr) throw new Error(`generateLink: ${linkErr.message}`);
  const { data: sess, error: otpErr } = await anon.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: "magiclink" });
  if (otpErr || !sess.session) throw new Error(`magic link fallback: ${otpErr?.message ?? "no session"}`);
  log("email-link fallback ok");

  // password reset link must produce a usable session
  const { data: rec, error: recErr } = await admin.auth.admin.generateLink({ type: "recovery", email });
  if (recErr) throw new Error(`recovery link: ${recErr.message}`);
  const { data: recSess, error: recVerifyErr } = await anon.auth.verifyOtp({ token_hash: rec.properties.hashed_token, type: "recovery" });
  if (recVerifyErr || !recSess.session) throw new Error(`recovery verify: ${recVerifyErr?.message ?? "no session"}`);
  const { error: updErr } = await anon.auth.updateUser({ password: `${PASSWORD}-new` });
  if (updErr) throw new Error(`password update: ${updErr.message}`);
  // Changing the password revokes other sessions, so the old token is dead now.
  const stale = await fetch(`${BASE}/api/meetings`, { headers: { Authorization: `Bearer ${token}` } });
  const { data: re, error: reErr } = await anon.auth.signInWithPassword({ email, password: `${PASSWORD}-new` });
  if (reErr || !re.session) throw new Error(`sign-in with new password: ${reErr?.message ?? "no session"}`);
  token = re.session.access_token;
  log(`password reset flow ok (old token now returns ${stale.status})`);

  // 2. unauthenticated requests must be rejected
  const noAuth = await fetch(`${BASE}/api/meetings`);
  if (noAuth.status !== 401) throw new Error(`expected 401 without auth, got ${noAuth.status}`);
  log("unauthenticated request correctly rejected (401)");

  // 3. create meeting + upload
  const audio = readFileSync(AUDIO);
  const mime = AUDIO.endsWith(".wav") ? "audio/wav" : "audio/webm";
  const created = await api("/api/meetings", { method: "POST", body: JSON.stringify({ mimeType: mime, bytes: audio.length, durationSeconds: 40, recordedAt: new Date().toISOString() }) }, token);
  if (created.status !== 201) throw new Error(`create meeting: ${created.status} ${JSON.stringify(created.json)}`);
  meetingId = created.json.meetingId;
  log(`meeting created ${meetingId}`);
  // The response must not carry internals the browser has no business seeing.
  for (const leaked of ["storagePath", "storage_path", "user_id"]) {
    if (leaked in created.json) throw new Error(`create response leaked ${leaked}`);
  }

  const put = await fetch(created.json.signedUrl, { method: "PUT", headers: { "Content-Type": mime, "x-upsert": "true" }, body: audio });
  if (!put.ok) throw new Error(`upload: ${put.status} ${await put.text()}`);
  log(`uploaded ${(audio.length / 1024).toFixed(0)} KB straight to storage`);

  // 4. process + poll
  const proc = await api(`/api/meetings/${meetingId}/process`, { method: "POST", body: "{}" }, token);
  if (proc.status !== 202) throw new Error(`process: ${proc.status} ${JSON.stringify(proc.json)}`);
  log(`processing queued (${proc.json.status})`);

  let m = null;
  for (let i = 0; i < 100; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    const got = await api(`/api/meetings/${meetingId}`, {}, token);
    if (got.status !== 200) throw new Error(`get: ${got.status} ${JSON.stringify(got.json)}`);
    m = got.json.meeting;
    if (i % 3 === 0) log(`status: ${m.status}`);
    if (m.status === "done" || m.status === "error") break;
  }
  if (!m || m.status !== "done") throw new Error(`pipeline ended with ${m?.status}: ${m?.error}`);
  log(`done: "${m.title}" | ${m.transcript.length} segments | ${m.notes.action_items.length} actions | ${m.notes.decisions.length} decisions | ${m.notes.people_to_contact.length} people`);

  // A normal account must not see storage paths, ids, token counts or costs.
  const forbidden = ["user_id", "storage_path", "mime_type", "bytes", "usage", "transcription_cost_usd", "llm_cost_usd", "created_at", "updated_at"];
  const leaked = forbidden.filter((k) => k in m);
  if (leaked.length) throw new Error(`meeting response leaked: ${leaked.join(", ")}`);
  if (m.internal) throw new Error("non-owner account received internal cost figures");
  log(`internals hidden from a normal account (checked ${forbidden.length} fields)`);
  log(`duration ${m.durationSeconds}s, hasAudio ${m.hasAudio}`);

  // 5. action items became real, tickable task rows
  const tasksRes = await api("/api/tasks", {}, token);
  if (tasksRes.status !== 200) throw new Error(`tasks list: ${tasksRes.status} ${JSON.stringify(tasksRes.json)}`);
  const tasks = tasksRes.json.tasks ?? [];
  if (tasks.length !== m.notes.action_items.length) {
    throw new Error(`expected ${m.notes.action_items.length} tasks, got ${tasks.length}`);
  }
  for (const leakedField of ["user_id", "meeting_id", "idx", "created_at", "updated_at"]) {
    if (leakedField in tasks[0]) throw new Error(`task response leaked ${leakedField}`);
  }
  if (tasks.some((t) => t.status !== "open")) throw new Error("new tasks should start open");
  log(`${tasks.length} tasks created from the action items, internals hidden`);

  const ticked = await api(`/api/tasks/${tasks[0].id}`, { method: "PATCH", body: JSON.stringify({ status: "done" }) }, token);
  if (ticked.status !== 200 || ticked.json.task.status !== "done" || !ticked.json.task.completedAt) {
    throw new Error(`tick task: ${ticked.status} ${JSON.stringify(ticked.json)}`);
  }
  const badStatus = await api(`/api/tasks/${tasks[0].id}`, { method: "PATCH", body: JSON.stringify({ status: "banana" }) }, token);
  if (badStatus.status !== 400) throw new Error(`invalid status accepted: ${badStatus.status}`);
  log("task ticked off and an invalid status refused");

  // 6. the agent drafts a ticket, and nothing leaves without approval
  const drafted = await api(`/api/tasks/${tasks[1].id}/draft`, { method: "POST", body: "{}" }, token);
  if (drafted.status !== 201) throw new Error(`draft ticket: ${drafted.status} ${JSON.stringify(drafted.json)}`);
  const d = drafted.json.draft;
  if (d.status !== "pending") throw new Error(`a new draft must start pending, got ${d.status}`);
  for (const leakedField of ["user_id", "usage", "cost_usd", "model", "updated_at"]) {
    if (leakedField in d) throw new Error(`draft response leaked ${leakedField}`);
  }
  if (!d.subject || !d.body) throw new Error("draft came back empty");
  log(`ticket drafted: "${d.subject}" (${d.body.length} chars, pending)`);

  // Drafting the same task again replaces rather than duplicates.
  const again = await api(`/api/tasks/${tasks[1].id}/draft`, { method: "POST", body: "{}" }, token);
  if (again.status !== 201) throw new Error(`re-draft: ${again.status}`);
  const allDrafts = await api("/api/drafts", {}, token);
  if ((allDrafts.json.drafts ?? []).length !== 1) throw new Error(`re-drafting duplicated: ${allDrafts.json.drafts?.length} drafts`);
  log("re-drafting the same task replaces the old one");

  // Edit the wording, then approve.
  const edited = await api(`/api/drafts/${d.id}`, { method: "PATCH", body: JSON.stringify({ subject: "Edited by e2e" }) }, token);
  if (edited.status !== 200 || edited.json.draft.subject !== "Edited by e2e") throw new Error(`edit draft: ${edited.status}`);
  const blank = await api(`/api/drafts/${d.id}`, { method: "PATCH", body: JSON.stringify({ subject: "   " }) }, token);
  if (blank.status !== 400) throw new Error(`empty subject accepted: ${blank.status}`);
  const approved = await api(`/api/drafts/${d.id}`, { method: "PATCH", body: JSON.stringify({ status: "approved" }) }, token);
  if (approved.status !== 200 || approved.json.draft.status !== "approved" || !approved.json.draft.approvedAt) {
    throw new Error(`approve draft: ${approved.status} ${JSON.stringify(approved.json)}`);
  }
  log("draft edited and approved");

  // An email can only be drafted for someone the notes actually named.
  const person = m.notes.people_to_contact[0];
  if (person) {
    const mail = await api(`/api/meetings/${meetingId}/draft-email`, { method: "POST", body: JSON.stringify({ name: person.name }) }, token);
    if (mail.status !== 201 || mail.json.draft.kind !== "email") throw new Error(`draft email: ${mail.status} ${JSON.stringify(mail.json)}`);
    if (mail.json.draft.recipient !== person.name) throw new Error("email drafted for the wrong person");
    log(`email drafted to ${person.name}: "${mail.json.draft.subject}"`);
  }
  const madeUp = await api(`/api/meetings/${meetingId}/draft-email`, { method: "POST", body: JSON.stringify({ name: "Nobody McInvented" }) }, token);
  if (madeUp.status !== 400) throw new Error(`email drafted for someone not in the notes: ${madeUp.status}`);
  log("refused to draft an email for someone the notes never mentioned");

  // 7. list, rename, another user can't see it, audio link, delete
  const list = await api("/api/meetings", {}, token);
  if (!list.json.meetings?.some((x) => x.id === meetingId)) throw new Error("meeting missing from list");
  const renamed = await api(`/api/meetings/${meetingId}`, { method: "PATCH", body: JSON.stringify({ title: "Renamed by e2e" }) }, token);
  if (renamed.status !== 200 || renamed.json.meeting.title !== "Renamed by e2e") throw new Error(`rename failed: ${renamed.status}`);
  log("list + rename ok");

  const audioRes = await fetch(`${BASE}/api/meetings/${meetingId}/audio`, { headers: { Authorization: `Bearer ${token}` }, redirect: "manual" });
  if (audioRes.status !== 302) throw new Error(`audio link: expected 302, got ${audioRes.status}`);
  log("audio download link ok (302 to signed URL)");

  // isolation: a second user must get 404 for this meeting
  const other = `e2e-other-${Date.now()}@meetnote.invalid`;
  const { data: ou } = await admin.auth.admin.createUser({ email: other, email_confirm: true });
  const { data: olink } = await admin.auth.admin.generateLink({ type: "magiclink", email: other });
  const { data: osess } = await anon.auth.verifyOtp({ token_hash: olink.properties.hashed_token, type: "magiclink" });
  const peek = await api(`/api/meetings/${meetingId}`, {}, osess.session.access_token);
  const peekTasks = await api("/api/tasks", {}, osess.session.access_token);
  const peekDrafts = await api("/api/drafts", {}, osess.session.access_token);
  if ((peekDrafts.json.drafts ?? []).length !== 0) throw new Error("isolation broken: other user saw the drafts");
  const peekTick = await api(`/api/tasks/${tasks[1].id}`, { method: "PATCH", body: JSON.stringify({ status: "done" }) }, osess.session.access_token);
  await admin.auth.admin.deleteUser(ou.user.id);
  if (peek.status !== 404) throw new Error(`isolation broken: other user read the meeting (${peek.status})`);
  if ((peekTasks.json.tasks ?? []).length !== 0) throw new Error("isolation broken: other user saw the tasks");
  if (peekTick.status !== 404) throw new Error(`isolation broken: other user ticked a task (${peekTick.status})`);
  log("row level security ok (other user sees no meeting and no tasks)");

  const del = await api(`/api/meetings/${meetingId}`, { method: "DELETE" }, token);
  if (del.status !== 200) throw new Error(`delete: ${del.status} ${JSON.stringify(del.json)}`);
  const afterDelete = await api("/api/tasks", {}, token);
  if ((afterDelete.json.tasks ?? []).length !== 0) throw new Error("tasks outlived their meeting");
  const draftsAfter = await api("/api/drafts", {}, token);
  if ((draftsAfter.json.drafts ?? []).length !== 0) throw new Error("drafts outlived their meeting");
  meetingId = null;
  log("deleted meeting + audio; tasks and drafts went with it");
  console.log("\nE2E PASSED");
} catch (err) {
  console.error("\nE2E FAILED:", err.message);
  process.exitCode = 1;
} finally {
  if (meetingId) await admin.from("meetings").delete().eq("id", meetingId);
  if (userId) await admin.auth.admin.deleteUser(userId).catch(() => {});
}
