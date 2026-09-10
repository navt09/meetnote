// Fills tasks.quote_context on tasks that were written before the column existed.
//
// Nothing new is discovered here. A task's quote is already stored verbatim and
// the meeting's transcript is already stored beside it; this only matches one
// against the other and caches the lines either side, which is exactly what the
// pipeline now does at extraction time. No model, no vendor call, no cost.
//
//   node scripts/backfill-quote-context.mjs            # report only
//   node scripts/backfill-quote-context.mjs --apply    # write them
//
// Every write names both the task and the user it belongs to. This holds the
// service role, which bypasses Row Level Security, so an unscoped update would
// reach every account in the database. That has happened here once already.
import { readFileSync, existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { quoteContext } from "../src/lib/quote-context.ts";

for (const line of existsSync(".env.local") ? readFileSync(".env.local", "utf8").split(/\r?\n/) : []) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}
const apply = process.argv.includes("--apply");
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const { data: meetings, error } = await admin.from("meetings").select("id,title,transcript");
if (error) throw error;

let filled = 0;
let unplaceable = 0;

for (const m of meetings ?? []) {
  const segments = Array.isArray(m.transcript) ? m.transcript : [];
  if (segments.length === 0) continue;

  const { data: tasks } = await admin
    .from("tasks")
    .select("id,user_id,title,quote,quote_context")
    .eq("meeting_id", m.id)
    .not("quote", "is", null);

  for (const t of tasks ?? []) {
    // Already done. Re-running is harmless but should be quiet.
    if (t.quote_context) continue;

    const around = quoteContext(t.quote, segments);
    if (!around) {
      // A normal outcome: the model can paraphrase, and a quote it tidied up
      // no longer matches the words in the transcript. Counted, not fixed.
      unplaceable++;
      continue;
    }

    filled++;
    const shown = [around.before && `…${around.before.text.slice(-40)}`, around.after && `${around.after.text.slice(0, 40)}…`]
      .filter(Boolean)
      .join("  /  ");
    console.log(`${t.title.slice(0, 34).padEnd(36)} ${shown}`);

    if (apply) {
      const { error: upErr } = await admin
        .from("tasks")
        .update({ quote_context: around })
        .eq("id", t.id)
        .eq("user_id", t.user_id);
      if (upErr) console.error("  failed:", upErr.message);
    }
  }
}

console.log(
  (apply ? `\nfilled ${filled} task(s)` : `\n${filled} task(s) would be filled. Re-run with --apply.`) +
    (unplaceable > 0 ? ` ${unplaceable} quote(s) could not be found in their transcript and were left alone.` : ""),
);
