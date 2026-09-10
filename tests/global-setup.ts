import { chromium, type FullConfig } from "@playwright/test";
import { writeFileSync } from "node:fs";
import { createFixture } from "../scripts/smoke-fixture.mjs";
import { AUTH_FILE, FIXTURE_FILE, ROUTES } from "./paths";

/**
 * Everything slow, done once.
 *
 * Signing in and building the account both talk to Supabase, which is not
 * always quick, and in development Next compiles a route the first time anyone
 * asks for it. Doing either inside a test makes the test's timeout a measure
 * of someone else's latency rather than of the app.
 *
 * So: one account, one sign-in saved as cookies every test reuses, and one
 * pass over the routes to get them compiled before anything is being timed.
 */
export default async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0]?.use?.baseURL ?? "http://localhost:3000";

  const fixture = await createFixture();
  writeFileSync(FIXTURE_FILE, JSON.stringify(fixture, null, 2));

  const browser = await chromium.launch();
  const page = await browser.newPage({ baseURL });
  try {
    await page.goto("/login");
    await page.getByLabel("Email").fill(fixture.email);
    await page.getByLabel("Password", { exact: true }).fill(fixture.password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page.waitForURL("**/dashboard", { timeout: 120_000 });

    // Warming is an optimisation, not an assertion. A machine that suspends
    // its network mid-loop should cost the run a slow first navigation, not
    // the whole run.
    for (const route of [...ROUTES, `/meetings/${fixture.meetingId}`]) {
      try {
        await page.goto(route, { timeout: 120_000 });
      } catch (err) {
        const why = err instanceof Error ? err.message : String(err);
        console.warn(`could not warm ${route}: ${why.slice(0, 120)}`);
      }
    }

    await page.context().storageState({ path: AUTH_FILE });
  } finally {
    await browser.close();
  }
}
