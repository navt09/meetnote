import { existsSync, rmSync } from "node:fs";
import { cleanFixtures } from "../scripts/smoke-fixture.mjs";
import { AUTH_FILE, FIXTURE_FILE } from "./paths";

/**
 * Removes the throwaway account and the files pointing at it.
 *
 * cleanFixtures rather than a single delete, so a run that died before writing
 * the fixture file, or an earlier crashed run, does not leave accounts behind.
 * It only ever touches smoke-*@fromthecall.invalid.
 */
export default async function globalTeardown() {
  try {
    const removed = await cleanFixtures();
    if (removed > 0) console.log(`\ncleaned ${removed} smoke account(s)`);
  } catch (err) {
    console.error("smoke cleanup failed:", err instanceof Error ? err.message : err);
  }
  for (const file of [FIXTURE_FILE, AUTH_FILE]) {
    if (existsSync(file)) rmSync(file);
  }
}
