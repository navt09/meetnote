// A throwaway account with one finished meeting, built by writing rows
// directly. No audio, no Deepgram, no Claude: the smoke test is checking that
// pages render what they are given, and paying a vendor on every run to find
// that out would be daft.
//
//   node scripts/smoke-fixture.mjs           # create one, print credentials
//   node scripts/smoke-fixture.mjs --clean   # remove every smoke account
//
// Every account this makes is smoke-*@fromthecall.invalid, and --clean will
// only ever touch that pattern. Anything holding the service role has to be
// scoped like this: it bypasses row level security, so an unfiltered write
// reaches every account in the database.

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";

// The Playwright runner loads this file as CommonJS, where import.meta does
// not exist, so the repo root comes from the working directory instead. Every
// script here is run from the root.
const root = process.cwd();
for (const line of existsSync(join(root, ".env.local")) ? readFileSync(join(root, ".env.local"), "utf8").split(/\r?\n/) : []) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_ || !SERVICE) {
  console.error("Missing Supabase env vars in .env.local");
  process.exit(1);
}

const admin = createClient(URL_, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });

export const SMOKE_PASSWORD = "smoke-password-1234";
const PREFIX = "smoke-";
const DOMAIN = "@fromthecall.invalid";

/**
 * Supabase's auth admin endpoint returns the odd 504. A smoke run that fails
 * because a vendor hiccupped teaches nothing and trains people to ignore red,
 * so the calls that set the fixture up get three goes before giving up.
 */
async function withRetry(label, fn, attempts = 3) {
  let last;
  for (let i = 1; i <= attempts; i++) {
    const res = await fn();
    if (!res.error) return res;
    last = res.error;
    const transient = [408, 429, 500, 502, 503, 504].includes(Number(last.status));
    if (!transient || i === attempts) break;
    await new Promise((r) => setTimeout(r, 400 * i));
  }
  throw new Error(`${label}: ${last?.message ?? "unknown error"}`);
}

/** Only ever true for an account this file made. Guards every delete. */
function isSmokeEmail(email) {
  return typeof email === "string" && email.startsWith(PREFIX) && email.endsWith(DOMAIN);
}

const MEETING_TITLE = "Smoke Test: Login Refactor and the Export Bug";

/**
 * The name on the account. Not optional any more: the Record page asks for one
 * before it offers the recorder, so a nameless fixture would open the name
 * prompt where the smoke pass expects the window picker.
 *
 * It is also what the Tasks page filters by, so the fixture's own work is
 * owned by this name and somebody else's work is owned by somebody else. That
 * is the shape of a real account, and it means the pass covers both.
 */
const FIXTURE_NAME = "Alex";

function notes(dayOffset) {
  const due = new Date(Date.now() + dayOffset * 86_400_000);
  due.setHours(9, 0, 0, 0);
  return {
    summary:
      "Marcus finished the login refactor and is starting the payment webhook. Priya found a bug crashing the export on large files and will fix it. The team agreed to hold the dark mode launch until the icons land.",
    key_points: [
      "The login refactor is done and merged.",
      "Export crashes above ten thousand rows.",
      "Dark mode waits for the final icons.",
    ],
    action_items: [
      // The first carries a quote and a first step so the smoke pass can open
      // it; the last deliberately carries neither, so the pass also proves a
      // task with nothing to show offers no expander at all.
      {
        title: "Fix the export crash on large files",
        details: "Crashes above ten thousand rows.",
        owner: FIXTURE_NAME,
        due: "Friday",
        priority: "high",
        kind: "bug",
        quote: "I found a crash in the export on anything over ten thousand rows.",
        first_step: "Reproduce it with a ten thousand row export before changing anything.",
        blocked_by: null,
      },
      {
        title: "Start the payment webhook",
        details: "Now that the login refactor is merged.",
        owner: "Marcus",
        due: null,
        priority: "medium",
        kind: "task",
        quote: "Login refactor is merged, so I am picking up the payment webhook today.",
        first_step: null,
        blocked_by: null,
      },
      {
        title: "Chase the design team for the dark mode icons",
        details: "",
        owner: FIXTURE_NAME,
        due: "Monday",
        priority: "medium",
        kind: "follow_up",
        quote: null,
        first_step: null,
        blocked_by: "The final dark mode icons are not ready.",
      },
      // Nothing at all on this one, so the pass still proves a task with
      // nothing to show offers no expander.
      {
        title: "Confirm whether scheduled reports hit the same export path",
        details: "",
        owner: FIXTURE_NAME,
        due: null,
        priority: "low",
        kind: "task",
        quote: null,
        first_step: null,
        blocked_by: null,
      },
    ],
    decisions: [
      { decision: "Dark mode launch moves to next sprint", context: "The icons are not ready and shipping half of it would look worse than waiting." },
    ],
    people_to_contact: [
      { name: "Sam", role: "Acme", why: "Needs warning that the export API changes next sprint." },
    ],
    open_questions: ["Does the export bug affect the scheduled reports too?"],
    for_you: {
      committed: ["Chase the design team for the dark mode icons"],
      asked_of_you: ["Confirm whether scheduled reports hit the same export path"],
      heads_up: ["The export bug is customer facing"],
      mentioned: [],
    },
    _due_at: due.toISOString(),
  };
}

const TRANSCRIPT = [
  { start: 0, end: 6, speaker: "Marcus", text: "Login refactor is merged, so I am picking up the payment webhook today." },
  { start: 6, end: 13, speaker: FIXTURE_NAME, text: "I found a crash in the export on anything over ten thousand rows. I will have a fix by Friday." },
  { start: 13, end: 17, speaker: "Priya", text: "Then dark mode waits. We still have no icons." },
  { start: 17, end: 22, speaker: FIXTURE_NAME, text: "Agreed. I will chase design on Monday." },
];

/**
 * The lines either side of the first task's quote, which is TRANSCRIPT[1].
 *
 * Derived from the transcript rather than typed out, so it cannot drift from
 * it. The pipeline finds this by matching text; the fixture never runs the
 * pipeline, so it writes the answer the matcher would have reached.
 */
const QUOTE_CONTEXT = {
  before: { speaker: TRANSCRIPT[0].speaker, text: TRANSCRIPT[0].text },
  after: { speaker: TRANSCRIPT[2].speaker, text: TRANSCRIPT[2].text },
};

/** Creates the account and everything the pages need to render. */
export async function createFixture() {
  const email = `${PREFIX}${Date.now()}${DOMAIN}`;
  const { data: created } = await withRetry("could not create the smoke user", () =>
    admin.auth.admin.createUser({ email, password: SMOKE_PASSWORD, email_confirm: true }),
  );
  const userId = created.user.id;

  // Recording needs an active account, so the Record page shows the recorder
  // rather than the upgrade notice.
  await admin.from("accounts").upsert({ user_id: userId, tier: "active", note: "smoke test" }, { onConflict: "user_id" });

  // A paying account. The fixture hands itself a drafted follow-up, and a free
  // account cannot have one: drafting, approving, editing and choosing where a
  // draft goes all pass through the same paid gate. A fixture that cannot do
  // what the page it is testing exists for tests the wrong page.
  await withRetry("could not set the smoke tier", () =>
    admin.from("accounts").upsert({ user_id: userId, tier: "active", note: "smoke fixture" }, { onConflict: "user_id" }),
  );

  // Recording also needs a name, for the same reason: without one the Record
  // page asks for it instead of offering the recorder.
  await admin
    .from("user_settings")
    .upsert({ user_id: userId, display_name: FIXTURE_NAME, ticket_provider: "linear" }, { onConflict: "user_id" });

  const body = notes(2);
  const dueAt = body._due_at;
  delete body._due_at;

  const { data: meeting } = await withRetry("could not create the smoke meeting", () =>
    admin
    .from("meetings")
    .insert({
      user_id: userId,
      title: MEETING_TITLE,
      status: "done",
      recorded_at: new Date(Date.now() - 3_600_000).toISOString(),
      duration_seconds: 1140,
      storage_path: null,
      transcript: TRANSCRIPT,
      notes: body,
      transcription_cost_usd: 0,
      llm_cost_usd: 0,
    })
    .select("id")
    .single(),
  );

  const rows = body.action_items.map((a, idx) => ({
    user_id: userId,
    meeting_id: meeting.id,
    idx,
    title: a.title,
    details: a.details,
    owner: a.owner,
    due: a.due,
    quote: a.quote ?? null,
    first_step: a.first_step ?? null,
    quote_context: idx === 0 ? QUOTE_CONTEXT : null,
    blocked_by: a.blocked_by ?? null,
    // One real deadline, so the Tasks page's due column has something to show.
    due_at: idx === 0 ? dueAt : null,
    priority: a.priority,
    kind: a.kind,
  }));
  const { data: taskRows } = await admin.from("tasks").insert(rows).select("id,idx");
  const firstTask = (taskRows ?? []).find((t) => t.idx === 0);
  const secondTask = (taskRows ?? []).find((t) => t.idx === 1);
  const thirdTask = (taskRows ?? []).find((t) => t.idx === 2);

  // One ticket already waiting on a decision, so Approvals has something to
  // render. Written straight into the table: the real route would call the
  // model, and a smoke run must cost nothing.
  if (firstTask) {
    await withRetry("could not create the smoke draft", () =>
      admin.from("drafts").insert({
        user_id: userId,
        meeting_id: meeting.id,
        task_id: firstTask.id,
        kind: "ticket",
        subject: "Fix the CSV export crash on large files",
        body: "## Context\n\nThe export crashes on anything over ten thousand rows.\n\n## Done when\n\n- A ten thousand row export completes",
        status: "pending",
        // Where it would go if approved. Set as the real route sets it, from
        // the account's preference below.
        send_to: "linear",
      }),
    );
  }

  // And one already approved and delivered, so the Approved list has a draft
  // that can say where it ended up. A different task, because one live draft
  // per task is a unique index.
  if (secondTask) {
    await withRetry("could not create the smoke sent draft", () =>
      admin.from("drafts").insert({
        user_id: userId,
        meeting_id: meeting.id,
        task_id: secondTask.id,
        kind: "ticket",
        subject: "Add a row limit to the export endpoint",
        body: "Cap the export and paginate beyond the cap.",
        status: "approved",
        approved_at: new Date().toISOString(),
        send_to: "linear",
        // The receipt, written only because a send succeeded.
        destination: "linear",
        external_url: "https://linear.app/smoke/issue/ENG-42",
      }),
    );
  }

  // And one approved that never went anywhere, which is the state a person
  // reaches by approving before connecting anything. It used to be a dead end:
  // delivery only ran on the move into "approved", and that had been and gone.
  if (thirdTask) {
    await withRetry("could not create the smoke unsent draft", () =>
      admin.from("drafts").insert({
        user_id: userId,
        meeting_id: meeting.id,
        task_id: thirdTask.id,
        kind: "ticket",
        subject: "Write up the retention policy",
        body: "Decide how long recordings are kept and write it down.",
        status: "approved",
        approved_at: new Date().toISOString(),
        send_to: "linear",
        destination: null,
        external_url: null,
      }),
    );
  }

  // Two connectors, so the destination control on Approvals has something to
  // choose between. The credentials are deliberate nonsense: nothing in the
  // smoke run decrypts them, because nothing in a smoke run calls a vendor.
  // What is read is the provider name, which is all the destination list needs.
  // Microsoft carries scopes rather than an empty config, because what it can
  // do lives there: one sign-in covers several products and being connected
  // says nothing about which of them are reachable. These are the ones a
  // personal account can grant, which is the common case.
  const CONNECTORS = [
    { provider: "linear", config: {} },
    { provider: "slack", config: {} },
    {
      provider: "microsoft",
      config: {
        email: "alex@example.com",
        personal: true,
        scopes: ["Mail.Send", "Calendars.ReadWrite", "Tasks.ReadWrite", "Files.ReadWrite", "User.Read"],
      },
    },
  ];
  for (const { provider, config } of CONNECTORS) {
    await withRetry(`could not connect smoke ${provider}`, () =>
      admin.from("connectors").upsert(
        { user_id: userId, provider, credentials: "smoke-fixture-not-a-real-credential", config },
        { onConflict: "user_id,provider" },
      ),
    );
  }

  return { email, password: SMOKE_PASSWORD, userId, name: FIXTURE_NAME, meetingId: meeting.id, meetingTitle: MEETING_TITLE };
}

/** Removes one account. Refuses anything that is not a smoke account. */
export async function destroyFixture(userId) {
  const { data } = await admin.auth.admin.getUserById(userId);
  const email = data?.user?.email;
  if (!isSmokeEmail(email)) throw new Error(`refusing to delete ${email ?? userId}: not a smoke account`);
  await admin.auth.admin.deleteUser(userId);
}

/** Removes every account this file has ever made. */
export async function cleanFixtures() {
  const { data, error } = await admin.auth.admin.listUsers({ perPage: 200 });
  if (error) throw error;
  let n = 0;
  for (const u of data.users) {
    if (!isSmokeEmail(u.email)) continue;
    await admin.auth.admin.deleteUser(u.id);
    n++;
  }
  return n;
}
