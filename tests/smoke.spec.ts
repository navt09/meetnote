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
    // The fixture leaves one ticket waiting on a decision, so this is the
    // populated page rather than the empty one.
    await expect(page.getByText("Fix the CSV export crash on large files").first()).toBeVisible();

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

  test("Home's list is your work, not everybody's", async ({ page }) => {
    // The fixture meeting has tasks owned by Alex and by Marcus. Home used to
    // show both while the "All tasks" link beside it went to a page showing
    // only Alex's, so the two disagreed about whose page it was.
    await page.goto("/dashboard");
    const list = page.locator("section", { hasText: "Top of the list" }).first();
    await expect(list.getByText("Marcus")).toHaveCount(0);
    await expect(list.getByText("Alex").first()).toBeVisible();
  });

  test("a draft says where approving would send it, and lets you change it", async ({ page }) => {
    // The complaint this fixes: "draft ticket" said nothing about whether the
    // ticket was going to Linear, to Jira, to Slack or nowhere at all, and the
    // one setting that decided it lived on another page.
    await page.goto("/approvals");

    const card = page.locator("li.glass", { hasText: "Fix the CSV export crash" });
    await expect(card.getByText("Approving creates this as an issue in Linear.")).toBeVisible();
    await page.screenshot({ path: "test-results/approvals-destination.png", fullPage: true });

    // Slack is a real destination but not a tracker, and the wording has to say
    // so: a message in a channel has no owner and no state.
    // The control updates before the request lands, which is deliberate, so the
    // save has to be waited for rather than inferred from the screen.
    const saved = page.waitForResponse((r) => r.url().includes("/api/drafts/") && r.request().method() === "PATCH");
    await card.getByRole("button", { name: "Slack", exact: true }).click();
    await expect(card.getByText(/not be tracked or assigned/)).toBeVisible();
    expect((await saved).status()).toBe(200);

    // Jira is not connected, so it is not on offer at all.
    await expect(card.getByRole("button", { name: "Jira", exact: true })).toHaveCount(0);

    // Microsoft is connected with the permissions a personal account can
    // grant, so To Do is a real destination for a follow-up.
    await expect(card.getByRole("button", { name: "To Do", exact: true })).toBeVisible();

    // One press does both, and the button says both.
    await expect(card.getByRole("button", { name: "Approve and send" })).toBeVisible();

    // The choice is the draft's, not the page's: it survives a reload.
    await page.reload();
    const again = page.locator("li.glass", { hasText: "Fix the CSV export crash" });
    await expect(again.getByText(/not be tracked or assigned/)).toBeVisible();

    // Copying sends nothing, so the button stops promising to.
    await again.getByRole("button", { name: "Copy only", exact: true }).click();
    await expect(again.getByRole("button", { name: "Approve", exact: true })).toBeVisible();
    await expect(again.getByRole("button", { name: "Approve and send" })).toHaveCount(0);
  });

  test("an approved draft says where it ended up", async ({ page }) => {
    await page.goto("/approvals");
    await page.getByRole("button", { name: "Approved", exact: true }).click();

    const sent = page.locator("li.glass", { hasText: "Add a row limit to the export" });
    await expect(sent.getByText("Sent to Linear")).toBeVisible();
    await expect(sent.getByRole("link", { name: "Open in Linear" })).toHaveAttribute(
      "href",
      "https://linear.app/smoke/issue/ENG-42",
    );
    await page.screenshot({ path: "test-results/approvals-sent.png", fullPage: true });

    // Past tense only, and nothing to send: it already went.
    await expect(sent.getByRole("button", { name: /^Send to/ })).toHaveCount(0);

    // Approved but never delivered is not a dead end. It keeps the control and
    // gains a way to send it, which is the only route out of that state.
    const unsent = page.locator("li.glass", { hasText: "Write up the retention policy" });
    await expect(unsent.getByText("Not sent, kept to copy")).toHaveCount(0);
    await expect(unsent.getByRole("button", { name: "Send to Linear" })).toBeVisible();
    await expect(unsent.getByRole("button", { name: "Slack", exact: true })).toBeVisible();
  });

  test("every connector is offered, Microsoft as one sign-in", async ({ page }) => {
    await page.goto("/settings");
    const connections = page.locator("div.glass", { hasText: "Connections" }).first();
    for (const name of ["Linear", "Jira", "Slack", "Google", "Microsoft"]) {
      await expect(connections.getByText(name).first()).toBeVisible();
    }

    // One row and one sign-in covering several products, rather than one row
    // each, which would be several consents for a single account. Asserted by
    // the row count, since whether a row offers Connect or says it needs a key
    // on the server depends on the environment rather than the code.
    await expect(connections.locator("svg")).toHaveCount(5);

    // Connected, the Microsoft row says which products that consent actually
    // reached rather than which ones exist.
    await expect(connections.getByText(/Outlook mail, Calendar, To Do, Excel on OneDrive/)).toBeVisible();

    // A personal account has no Teams channels or SharePoint sites, so it is
    // told why rather than offered buttons that cannot work.
    await expect(connections.getByText(/personal Microsoft account/)).toBeVisible();
    await expect(connections.getByRole("link", { name: /^Enable/ })).toHaveCount(0);
    await page.screenshot({ path: "test-results/settings-connectors.png", fullPage: true });
  });

  test("a meeting can be added to the Excel register", async ({ page }) => {
    await page.goto("/notes");
    await page.getByRole("link", { name: /Smoke Test/ }).first().click();
    await expect(page.getByRole("button", { name: "Add tasks to Excel" })).toBeVisible();
    await expect(page.getByText("Appends every task to your workbook.")).toBeVisible();
    await page.screenshot({ path: "test-results/meeting-excel.png", fullPage: true });
  });

  test("the workbook is chosen, not invented", async ({ page }) => {
    // Graph refuses to treat an empty file as a workbook, so one has to exist
    // already. The control says choose rather than create.
    await page.goto("/settings");
    const connections = page.locator("div.glass", { hasText: "Connections" }).first();
    await expect(connections.getByRole("button", { name: "Choose a workbook" })).toBeVisible();
    await expect(connections.getByText(/Where a meeting.s tasks get appended/)).toBeVisible();
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
