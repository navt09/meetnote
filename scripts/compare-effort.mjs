// Does extraction still catch everything at a lower reasoning effort?
//
// Reasoning tokens are billed as output, and output costs 5x input on Sonnet,
// so effort is the single biggest lever on what a meeting costs to extract.
// The risk is a quiet one: a cheaper run that drops one action item nobody
// notices is missing. So this re-runs the real extractor over one real
// transcript at each effort level and prints what each level CAUGHT and
// MISSED, item by item, not just what each level cost.
//
//   node scripts/compare-effort.mjs                          # plan only, spends nothing
//   node scripts/compare-effort.mjs --yes                     # actually calls the API
//   node scripts/compare-effort.mjs <meeting-id> --yes
//   node scripts/compare-effort.mjs --levels=low,medium,high --out=./effort --yes
//
// Read-only against Supabase: it never writes a row. The API calls cost real
// money, which is why nothing happens without --yes.
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, dirname, extname, resolve as resolvePath } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { registerHooks } from "node:module";
import { createClient } from "@supabase/supabase-js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
for (const line of existsSync(join(root, ".env.local")) ? readFileSync(join(root, ".env.local"), "utf8").split(/\r?\n/) : []) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}

// The app's own modules import each other without file extensions, which is
// what TypeScript and Next expect but not what Node's ESM resolver accepts.
// Node 24 strips the types happily; this only fills in the ".ts" it needs, so
// the harness runs the same extract.ts the product runs.
registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (err) {
      if (specifier.startsWith(".") && !extname(specifier)) return nextResolve(specifier + ".ts", context);
      throw err;
    }
  },
});

const { extractNotes, EXTRACT_MODEL } = await import("../src/lib/extract.ts");
const { llmCostUsd, MODEL_PRICING, formatUsd } = await import("../src/lib/cost.ts");
const { CATEGORIES, diffRuns, cheapestLossless } = await import("../src/lib/effort-compare.ts");

const VALID_LEVELS = ["low", "medium", "high", "xhigh", "max"];
const args = process.argv.slice(2);
const flag = (name) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const confirmed = args.includes("--yes");
const meetingArg = args.find((a) => !a.startsWith("--")) ?? null;
const levels = (flag("levels") ?? "low,medium").split(",").map((s) => s.trim()).filter(Boolean);
const outDir = resolvePath(flag("out") ?? join(tmpdir(), "effort-compare"));

for (const level of levels) {
  if (!VALID_LEVELS.includes(level)) {
    console.error(`Unknown effort level "${level}". Valid: ${VALID_LEVELS.join(", ")}`);
    process.exit(1);
  }
}

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_ || !SERVICE) {
  console.error("Missing Supabase env vars in .env.local");
  process.exit(1);
}
const admin = createClient(URL_, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });

/** The meeting asked for, or the most recent finished one that has a transcript. */
async function loadMeeting(id) {
  const columns = "id,title,user_id,recorded_at,status,transcript";
  if (id) {
    const { data, error } = await admin.from("meetings").select(columns).eq("id", id).single();
    if (error) throw new Error(`Could not read meeting ${id}: ${error.message}`);
    return data;
  }
  const { data, error } = await admin
    .from("meetings")
    .select(columns)
    .eq("status", "done")
    .not("transcript", "is", null)
    .order("recorded_at", { ascending: false })
    .limit(1);
  if (error) throw new Error(`Could not list meetings: ${error.message}`);
  return data?.[0] ?? null;
}

const meeting = await loadMeeting(meetingArg);
if (!meeting) {
  console.error("No finished meeting with a transcript to compare. Pass a meeting id, or record one first.");
  process.exit(1);
}
const segments = meeting.transcript;
if (!Array.isArray(segments) || segments.length === 0) {
  console.error(`Meeting ${meeting.id} has no transcript (status: ${meeting.status}).`);
  process.exit(1);
}

// The same label the pipeline would pass, so the notes are comparable to the
// ones this meeting actually got. Scoped to this meeting's own owner.
const { data: settings } = await admin.from("user_settings").select("display_name").eq("user_id", meeting.user_id).maybeSingle();
const name = settings?.display_name ?? null;

const chars = segments.reduce((n, s) => n + String(s.text ?? "").length, 0);
// Rough only: ~4 characters per token, and an output guess per level that
// grows with effort because reasoning is billed as output. It exists to stop
// anyone starting a run whose size would surprise them, not to be accurate.
const estInput = Math.round(chars / 4) + 700;
const EST_OUTPUT = { low: 4000, medium: 8000, high: 16000, xhigh: 24000, max: 32000 };
const price = MODEL_PRICING[EXTRACT_MODEL];
const estTotal = levels.reduce(
  (sum, l) => sum + (estInput * price.inputPerM + (EST_OUTPUT[l] ?? 8000) * price.outputPerM) / 1_000_000,
  0,
);

console.log(`Meeting     ${meeting.id}  ${meeting.title ?? "(untitled)"}`);
console.log(`Transcript  ${segments.length} segments, ${chars.toLocaleString()} characters (~${estInput.toLocaleString()} input tokens)`);
console.log(`Model       ${EXTRACT_MODEL}${name ? `, speaker label "${name}"` : ""}`);
console.log(`Runs        ${levels.length} (${levels.join(", ")})`);
console.log(`Estimated   ${formatUsd(estTotal)} total, very roughly`);
console.log(`Output dir  ${outDir}`);

if (!confirmed) {
  console.log("\nDry run. Nothing was called and nothing was spent. Re-run with --yes to make the API calls.");
  process.exit(0);
}

mkdirSync(outDir, { recursive: true });

const runs = [];
for (const level of levels) {
  process.stdout.write(`\nrunning ${level}... `);
  const started = Date.now();
  const result = await extractNotes(segments, { name, effort: level });
  const seconds = (Date.now() - started) / 1000;
  const path = join(outDir, `${meeting.id}.${level}.json`);
  writeFileSync(path, JSON.stringify(result.notes, null, 2));
  runs.push({ level, notes: result.notes, usage: result.usage, seconds, path });
  process.stdout.write(`${seconds.toFixed(1)}s\n`);
}

const pad = (s, n) => String(s).padEnd(n);
const num = (n, w) => String(n).padStart(w);

console.log("\n== What each level produced ==\n");
console.log(pad("level", 8) + num("actions", 8) + num("decisions", 11) + num("people", 8) + num("questions", 11) + num("key pts", 9));
for (const r of runs) {
  const n = r.notes;
  console.log(
    pad(r.level, 8) +
      num(n.action_items.length, 8) +
      num(n.decisions.length, 11) +
      num(n.people_to_contact.length, 8) +
      num(n.open_questions.length, 11) +
      num(n.key_points.length, 9),
  );
}

console.log("\n== What each level cost ==\n");
console.log(pad("level", 8) + num("in", 9) + num("out", 9) + num("cost", 11) + num("seconds", 10));
for (const r of runs) {
  const cost = llmCostUsd(r.usage, EXTRACT_MODEL);
  console.log(
    pad(r.level, 8) +
      num(r.usage.input_tokens.toLocaleString(), 9) +
      num(r.usage.output_tokens.toLocaleString(), 9) +
      num(formatUsd(cost), 11) +
      num(r.seconds.toFixed(1), 10),
  );
}

const CATEGORY_LABEL = { action_items: "action items", decisions: "decisions", people_to_contact: "people" };

console.log("\n== What you would lose ==");
for (let i = 0; i < runs.length; i++) {
  for (let j = i + 1; j < runs.length; j++) {
    const d = diffRuns(runs[i], runs[j]);
    console.log(`\n${d.a} vs ${d.b}`);
    if (d.identical) {
      console.log("  no difference: same items, same owners, same dates");
      continue;
    }
    for (const category of CATEGORIES) {
      for (const title of d.categories[category].onlyInA) console.log(`  only in ${d.a}  [${CATEGORY_LABEL[category]}] ${title}`);
      for (const title of d.categories[category].onlyInB) console.log(`  only in ${d.b}  [${CATEGORY_LABEL[category]}] ${title}`);
    }
    for (const g of d.fieldGaps) console.log(`  ${g.field} blank in ${g.blankIn}, "${g.value}" in ${g.filledIn}  -- ${g.title}`);
  }
}

console.log("\n== Verdict ==\n");
if (runs.length < 2) {
  console.log("Only one level was run, so there is nothing to compare it against.");
} else {
  const dearest = runs[runs.length - 1].level;
  const winner = cheapestLossless(runs);
  if (winner === null) console.log(`Every level cheaper than ${dearest} lost something. Keep paying for ${dearest}.`);
  else console.log(`${winner} is the cheapest level that lost nothing against ${dearest}.`);
}

console.log("\nFull notes written to:");
for (const r of runs) console.log(`  ${r.path}`);
