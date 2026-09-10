import { defineConfig, devices } from "@playwright/test";
import { AUTH_FILE } from "./tests/paths";

/**
 * The smoke pass. One browser, one worker, real sign-in against a local dev
 * server and a throwaway account.
 *
 * Not part of CI: it needs the Supabase service role key to build its fixture,
 * and a secret that can delete any account should not sit in a workflow that
 * runs on every pull request. Run it before pushing anything that touches the
 * UI: `npm run smoke`.
 */
export default defineConfig({
  testDir: "./tests",
  // One account and one sign-in for the whole run, with the routes compiled
  // before anything is timed.
  globalSetup: "./tests/global-setup.ts",
  globalTeardown: "./tests/global-teardown.ts",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [["list"]],
  // Supabase can be slow to answer; a test that fails on latency is noise.
  timeout: 90_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: process.env.SMOKE_BASE_URL ?? "http://localhost:3000",
    storageState: AUTH_FILE,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
