import { test, expect, type ConsoleMessage, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { FIXTURE_FILE, ROUTES } from "./paths";

/**
 * Every signed-in page, rendered and read.
 *
 * This replaces the pass I was doing by hand after each change: open each tab,
 * check the content is really there, check nothing is broken in the console,
 * then look again on a phone and in the other theme. Doing it by eye caught
 * things, but only the ones I remembered to look at.
 *
 * The account, its meeting and the sign-in all come from global setup, so
 * nothing here waits on Supabase. The meeting is written straight into the
 * database rather than recorded, so a run costs nothing and always contains
 * the same words.
 */

const fixture: {
  email: string;
  password: string;
  userId: string;
  name: string;
  meetingId: string;
  meetingTitle: string;
} = JSON.parse(readFileSync(FIXTURE_FILE, "utf8"));

/** Noise from the dev server that says nothing about the page. */
const IGNORED = [
  /Download the React DevTools/i,
  /\[Fast Refresh\]/i,
  /\[HMR\]/i,
  /WebSocket connection to .*_next\/hmr/i,
  /The destination stream closed early/i,
];

/** Console problems, collected before the first navigation so none are missed. */
function watchConsole(page: Page): string[] {
  const problems: string[] = [];
  page.on("console", (m: ConsoleMessage) => {
    if (m.type() !== "error" && m.type() !== "warning") return;
    const text = m.text();
    if (IGNORED.some((r) => r.test(text))) return;
    problems.push(`${m.type()}: ${text}`);
  });
  page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
  return problems;
}

test.describe("every page renders what it was given", () => {
  test("the whole app, with nothing broken in the console", async ({ page }) => {
    const problems = watchConsole(page);
    await page.goto("/dashboard");

    // Home
    await expect(page.getByText("Still to do").first()).toBeVisible();
    await expect(page.getByText("Top of the list").first()).toBeVisible();
    await expect(page.getByText("Sam").first()).toBeVisible();

    // Notes: the meeting, and what came out of it
    await page.getByRole("link", { name: "Notes", exact: true }).click();
    await expect(page).toHaveURL(/\/notes$/);
    await expect(page.getByText(fixture.meetingTitle).first()).toBeVisible();
    // The tally sets its count and its noun in separate spans, so the page
    // never literally contains "3 tasks". Assert the pieces.
    const listed = page.locator("li", { hasText: fixture.meetingTitle }).first();
    await expect(listed).toContainText("tasks");
    await expect(listed).toContainText("decision");

    // The meeting itself
    await page.getByText(fixture.meetingTitle).first().click();
    await expect(page).toHaveURL(/\/meetings\//);
    await expect(page.getByRole("heading", { name: "Smoke Test" })).toBeVisible();
    await expect(page.getByText("Needs doing").first()).toBeVisible();
    await expect(page.getByText("Dark mode launch moves to next sprint").first()).toBeVisible();
    await expect(page.getByText("Fix the export crash on large files").first()).toBeVisible();

    // Tasks, and the deadline column
    await page.getByRole("link", { name: "Tasks", exact: true }).click();
    await expect(page).toHaveURL(/\/tasks$/);
    await expect(page.getByRole("heading", { name: "Tasks" })).toBeVisible();
    await expect(page.getByText("Due", { exact: true }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /Go to Fix the export crash/ })).toBeVisible();
    // Tasks is this person's list. Marcus's webhook was in the same meeting and
    // is on the meeting page above; it has no business here.
    await expect(page.getByText("Start the payment webhook")).toHaveCount(0);

    // Approvals, Record, Settings
    await page.getByRole("link", { name: "Approvals", exact: true }).click();
    await expect(page).toHaveURL(/\/approvals$/);
    await expect(page.getByText("Nothing drafted yet").first()).toBeVisible();

    await page.getByRole("link", { name: "Record", exact: true }).click();
    await expect(page).toHaveURL(/\/record$/);
    await expect(page.getByRole("button", { name: /Choose a window/ })).toBeVisible();
    await expect(page.getByText("Pick the window").first()).toBeVisible();

    await page.getByRole("link", { name: "Settings", exact: true }).click();
    await expect(page).toHaveURL(/\/settings$/);
    await expect(page.getByText("Connections").first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Light" })).toBeVisible();

    expect(problems, `console problems:\n${problems.join("\n")}`).toEqual([]);
  });

  test("a deadline takes you to its task, past whatever filter was on", async ({ page }) => {
    await page.goto("/tasks");

    // Hide the open tasks first, so the jump has to clear the filter itself.
    await page.getByRole("button", { name: "Done", exact: true }).click();
    await expect(page.locator(".band-row")).toHaveCount(0);

    await page.getByRole("button", { name: /Go to Fix the export crash/ }).click();
    const row = page.locator(".band-row", { hasText: "Fix the export crash" });
    await expect(row).toBeVisible();
    await expect(row).toHaveClass(/task-flash/);
  });

  test("Home's lists take you to the thing they name", async ({ page }) => {
    await page.goto("/dashboard");

    // A task on Home lands on that task, opened past any filter and flashed.
    await page.getByRole("link", { name: /Fix the export crash/ }).first().click();
    await expect(page).toHaveURL(/\/tasks/);
    const row = page.locator(".band-row", { hasText: "Fix the export crash" });
    await expect(row).toBeVisible();
    await expect(row).toHaveClass(/task-flash/);

    // And a person lands on the people band of the meeting that named them,
    // which is where the draft-email button is.
    await page.goto("/dashboard");
    await page.getByRole("link", { name: /Sam/ }).first().click();
    await expect(page).toHaveURL(/\/meetings\/.*#people/);
    await expect(page.locator("#people")).toBeVisible();
    await expect(page.locator("#people")).toContainText("Sam");
  });

  test("a task opens to show what was said and where to start", async ({ page }) => {
    await page.goto("/tasks");

    // Scoped to the toggle itself: the row also holds a done checkbox and the
    // deadline column holds a "go to" button, and all three carry the title.
    const withContext = page.locator(".task-toggle", { hasText: "Fix the export crash" });
    await expect(withContext).toHaveAttribute("aria-expanded", "false");

    await withContext.click();
    await expect(withContext).toHaveAttribute("aria-expanded", "true");
    // The quote is the trust anchor: it has to be the words from the meeting,
    // not a paraphrase of them.
    await expect(page.getByText(/over ten thousand rows/)).toBeVisible();
    await expect(page.getByText(/Reproduce it with a ten thousand row export/)).toBeVisible();
    // The lines either side of the quote, which are what say why the task
    // exists rather than merely that somebody said it.
    await expect(page.getByText(/Login refactor is merged/)).toBeVisible();
    await expect(page.getByText(/Then dark mode waits/)).toBeVisible();

    await withContext.click();
    await expect(withContext).toHaveAttribute("aria-expanded", "false");

    // A task with nothing to show must not offer an expander that reveals
    // nothing.
    await expect(page.locator(".task-toggle", { hasText: "Confirm whether scheduled reports" })).toHaveCount(0);
  });

  test("a task that cannot be started says so before it is opened", async ({ page }) => {
    await page.goto("/tasks");

    const row = page.locator(".band-row", { hasText: "Chase the design team" });
    await expect(row.getByText("blocked", { exact: true })).toBeVisible();
    // Collapsed it is one word; the reason is a sentence and waits for a click.
    await expect(page.getByText(/final dark mode icons are not ready/)).toHaveCount(0);

    await page.locator(".task-toggle", { hasText: "Chase the design team" }).click();
    await expect(page.getByText("Waiting on")).toBeVisible();
    await expect(page.getByText(/final dark mode icons are not ready/)).toBeVisible();
  });

  test("the theme sticks across a reload", async ({ page }) => {
    await page.goto("/settings");

    await page.getByRole("button", { name: "Light" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");

    // The server stamps it, so it must survive a full load rather than being
    // reapplied by a script afterwards.
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");

    await page.getByRole("button", { name: "Dark" }).click();
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  });

  test("search finds a meeting by something said inside it", async ({ page }) => {
    await page.goto("/notes");

    await page.getByPlaceholder(/Search your meetings/).fill("ten thousand rows");
    await expect(page.getByText(fixture.meetingTitle).first()).toBeVisible();

    await page.getByPlaceholder(/Search your meetings/).fill("zzqqxx nothing said this");
    await expect(page.getByText(fixture.meetingTitle)).toHaveCount(0);
  });

  test("it holds together on a phone, in both themes", async ({ page }) => {
    // Two themes over every route, and in development each page is compiled
    // the first time it is asked for at this width.
    test.setTimeout(300_000);
    const problems = watchConsole(page);
    await page.setViewportSize({ width: 375, height: 812 });

    for (const theme of ["light", "dark"] as const) {
      await page.goto("/settings");
      await page.getByRole("button", { name: theme === "light" ? "Light" : "Dark" }).click();
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);

      for (const route of ROUTES) {
        await page.goto(route);
        await expect(page.locator("aside.rail")).toBeVisible();

        // Nothing may push the page sideways. This is the regression that keeps
        // coming back, and it is invisible until someone scrolls.
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        expect(overflow, `${route} scrolls sideways in ${theme}`).toBeLessThanOrEqual(0);
      }
    }

    expect(problems, `console problems:\n${problems.join("\n")}`).toEqual([]);
  });

  test("recording is not offered until there is a name to put on it", async ({ page }) => {
    // Clear the name the fixture arrives with, which is the state a brand new
    // account is in. Done through the API rather than the Settings form, so the
    // test is about the Record page and nothing else.
    await page.request.put("/api/settings/display-name", { data: { name: "" } });

    await page.goto("/record");
    await expect(page.getByRole("button", { name: /Choose a window/ })).toHaveCount(0);
    await expect(page.getByText("What should the notes call you?")).toBeVisible();

    await page.getByLabel("Your first name").fill(fixture.name);
    await page.getByRole("button", { name: "Save and record" }).click();

    // The recorder appears in place, without a trip to Settings and back.
    await expect(page.getByRole("button", { name: /Choose a window/ })).toBeVisible();
    await expect(page.getByText("What should the notes call you?")).toHaveCount(0);
  });
});
