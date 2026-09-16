import { join } from "node:path";

/** Written by global setup, read by the spec, removed by global teardown. */
export const FIXTURE_FILE = join(process.cwd(), "tests", ".fixture.json");
export const AUTH_FILE = join(process.cwd(), "tests", ".auth.json");

/**
 * Every page the app has behind sign-in. Add a route, add it here.
 *
 * Except /welcome: the account these are walked with pays, and a paying
 * account is sent straight past that page, so listing it here would only check
 * the dashboard twice. It has its own test, signed in as a free account.
 */
export const ROUTES = ["/dashboard", "/notes", "/tasks", "/approvals", "/record", "/settings"];
