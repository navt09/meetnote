// Rebuilds tasks.due and tasks.due_at from the meeting's own notes.
//
// meetings.notes is the source of truth for what a meeting agreed; the tasks
// table is a mirror of it. If a task's deadline is ever wrong or lost, this
// puts it back, resolving the words against the meeting's own recording time
// rather than today's clock, which is what "Thursday" meant when it was said.
//
//   node scripts/repair-task-due.mjs            # report only
//   node scripts/repair-task-due.mjs --apply    # write the fixes
import { readFileSync, existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { parseDue } from "../src/lib/schedule.ts";

for (const line of existsSync(".env.local") ? readFileSync(".env.local", "utf8").split(/\r?\n/) : []) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}
const apply = process.argv.includes("--apply");
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const { data: meetings, error } = await admin.from("meetings").select("id,title,recorded_at,notes");
if (error) throw error;

let changed = 0;
for (const m of meetings ?? []) {
  const items = m.notes?.action_items;
  if (!Array.isArray(items) || items.length === 0) continue;

  const { data: tasks } = await admin.from("tasks").select("id,idx,title,due,due_at").eq("meeting_id", m.id);
  const at = new Date(m.recorded_at);

  for (const t of tasks ?? []) {
    const said = items[t.idx]?.due ?? null;
    const due = typeof said === "string" && said.trim() ? said.trim().slice(0, 120) : null;
    const dueAt = parseDue(due, at)?.toISOString() ?? null;
    // Compare the instant, not the text: Postgres hands back "+00:00" where
    // toISOString writes "Z", so a string compare never settles.
    const same = due === t.due && (dueAt === null ? t.due_at === null : new Date(dueAt).getTime() === new Date(t.due_at ?? 0).getTime());
    if (same) continue;

    changed++;
    console.log(
      `${t.title.slice(0, 36).padEnd(38)} due ${String(t.due)} -> ${String(due)}` +
        `  |  ${t.due_at ? new Date(t.due_at).toDateString() : "null"} -> ${dueAt ? new Date(dueAt).toDateString() : "null"}`,
    );
    if (apply) {
      const { error: upErr } = await admin.from("tasks").update({ due, due_at: dueAt }).eq("id", t.id);
      if (upErr) console.error("  failed:", upErr.message);
    }
  }
}
console.log(apply ? `\napplied to ${changed} task(s)` : `\n${changed} task(s) would change. Re-run with --apply.`);
