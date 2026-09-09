// Renames the product throughout the codebase.
//
//   node scripts/rename.mjs <newname>            # dry run, shows every change
//   node scripts/rename.mjs <newname> --apply    # writes the files
//
// Three things are deliberately NOT renamed automatically, because each has a
// consequence outside this repository:
//
//   1. The deployed URL (meetnote-navt1.vercel.app). Changing it means renaming
//      the Vercel project, which changes the address people have bookmarked and
//      requires updating Supabase's redirect allow-list and every OAuth app's
//      callback URL. The script prints where it appears so you can do it
//      deliberately.
//   2. The IndexedDB database name in recording-store.ts. Renaming it makes any
//      recording currently backed up in someone's browser unreachable. Safe now,
//      while it's only you; not safe once other people use it.
//   3. Git history and past commit messages.

import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = join(import.meta.dirname, "..");
const raw = process.argv[2];
const apply = process.argv.includes("--apply");

if (!raw || raw.startsWith("--")) {
  console.error("Usage: node scripts/rename.mjs <newname> [--apply]");
  process.exit(1);
}
if (!/^[a-z][a-z0-9-]{1,30}$/.test(raw)) {
  console.error("The new name must be lowercase letters, digits and hyphens, starting with a letter.");
  process.exit(1);
}

const lower = raw;
const title = raw.charAt(0).toUpperCase() + raw.slice(1);

const EXTS = [".ts", ".tsx", ".md", ".json", ".sql", ".mjs", ".css"];
const SKIP_DIRS = new Set(["node_modules", ".next", ".git", "dist", "build"]);
const SKIP_FILES = new Set(["package-lock.json", "rename.mjs"]);

/** Lines matching these are reported but never edited. */
const PROTECTED = [
  { re: /meetnote-navt1\.vercel\.app/, why: "deployed URL: rename the Vercel project deliberately" },
  { re: /navt09\/meetnote/, why: "GitHub repository: rename it on GitHub first" },
  { re: /DB_NAME\s*=\s*"meetnote"/, why: "IndexedDB name: renaming orphans in-progress recordings in browsers" },
];

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (EXTS.some((e) => entry.endsWith(e)) && !SKIP_FILES.has(entry)) out.push(full);
  }
  return out;
}

let changed = 0;
let skipped = 0;

for (const file of walk(root)) {
  const before = readFileSync(file, "utf8");
  if (!/meetnote/i.test(before)) continue;

  const lines = before.split(/\r?\n/);
  const after = lines.map((line) => {
    const guard = PROTECTED.find((p) => p.re.test(line));
    if (guard) {
      skipped++;
      console.log(`  SKIP ${relative(root, file)}: ${guard.why}`);
      console.log(`       ${line.trim().slice(0, 110)}`);
      return line;
    }
    return line.replace(/Meetnote/g, title).replace(/meetnote/g, lower);
  });

  const result = after.join("\n");
  if (result === before) continue;

  const count = lines.filter((l, i) => l !== after[i]).length;
  changed += count;
  console.log(`${apply ? "WRITE" : "would change"} ${relative(root, file)} (${count} line${count === 1 ? "" : "s"})`);
  if (apply) writeFileSync(file, result);
}

console.log(`\n${apply ? "Changed" : "Would change"} ${changed} lines. Left ${skipped} protected lines alone.`);
if (!apply) console.log("Re-run with --apply to write the files.");
else {
  console.log("\nStill to do by hand:");
  console.log("  1. Rename the folder and the GitHub repository.");
  console.log("  2. Rename the Vercel project, then update Supabase Auth redirect URLs and every OAuth callback URL.");
  console.log("  3. Decide on the IndexedDB name in src/lib/recording-store.ts (see the note at the top of this script).");
  console.log("  4. npm install, to pick up the new package name.");
}
