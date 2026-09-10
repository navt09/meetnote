import { describe, expect, it } from "vitest";
import { actionItemsToRows, filterTasks, kindLabel, ownersOf, sortTasks, type PublicTask, personToEmail, tasksOwnedBy } from "../task";
import type { ActionItem } from "../schema";

const task = (over: Partial<PublicTask>): PublicTask => ({
  id: "t", meetingId: "m", meetingTitle: "Standup", title: "T", details: "", owner: null, due: null, dueAt: null,
  priority: "medium", kind: "task", status: "open", completedAt: null, createdAt: "2026-09-01T00:00:00Z",
  calendarEventUrl: null, quote: null, firstStep: null, quoteContext: null, ...over,
});

describe("actionItemsToRows", () => {
  it("numbers rows and carries the fields", () => {
    const items = [
      { title: "Fix crash", details: "on Safari", owner: "Marcus", due: "Thursday", priority: "high", kind: "bug" },
      { title: "Ship it", details: "", owner: null, due: null, priority: "low", kind: "feature" },
    ] as ActionItem[];
    const rows = actionItemsToRows(items, "u1", "m1");
    expect(rows[0]).toMatchObject({ user_id: "u1", meeting_id: "m1", idx: 0, title: "Fix crash", owner: "Marcus", priority: "high", kind: "bug" });
    expect(rows[1]).toMatchObject({ idx: 1, owner: null, due: null, priority: "low" });
  });

  it("falls back on bad or missing values", () => {
    const rows = actionItemsToRows(
      [{ title: "  ", details: "", owner: "   ", due: "", priority: "urgent", kind: "nonsense" } as unknown as ActionItem],
      "u", "m",
    );
    expect(rows[0]).toMatchObject({ title: "Untitled task", owner: null, due: null, priority: "medium", kind: "task" });
  });

  it("truncates very long text", () => {
    const rows = actionItemsToRows([{ title: "x".repeat(500), details: "y".repeat(5000), owner: null, due: null, priority: "low", kind: "task" } as ActionItem], "u", "m");
    expect(rows[0].title).toHaveLength(300);
    expect(rows[0].details).toHaveLength(2000);
  });

  it("carries the quote and the first step when the meeting gave them", () => {
    const rows = actionItemsToRows(
      [
        {
          title: "Fix the export crash",
          details: "Safari only",
          owner: "Marcus",
          due: null,
          priority: "high",
          kind: "bug",
          quote: "  it just dies when you hit export on Safari  ",
          first_step: "  Reproduce it on Safari with the file Priya sent.  ",
        } as ActionItem,
      ],
      "u",
      "m",
    );
    // Trimmed, but otherwise the words as they came back.
    expect(rows[0].quote).toBe("it just dies when you hit export on Safari");
    expect(rows[0].first_step).toBe("Reproduce it on Safari with the file Priya sent.");
  });

  it("stores null when the meeting gave nothing, and for notes written before they existed", () => {
    const [absent] = actionItemsToRows(
      [{ title: "Ship it", details: "", owner: null, due: null, priority: "low", kind: "task" } as unknown as ActionItem],
      "u",
      "m",
    );
    expect(absent.quote).toBeNull();
    expect(absent.first_step).toBeNull();

    const [empty] = actionItemsToRows(
      [{ title: "Ship it", details: "", owner: null, due: null, priority: "low", kind: "task", quote: null, first_step: "   " } as unknown as ActionItem],
      "u",
      "m",
    );
    expect(empty.quote).toBeNull();
    expect(empty.first_step).toBeNull();
  });

  it("bounds an absurdly long quote or first step", () => {
    const [row] = actionItemsToRows(
      [
        {
          title: "Ship it",
          details: "",
          owner: null,
          due: null,
          priority: "low",
          kind: "task",
          quote: "q".repeat(5000),
          first_step: "s".repeat(5000),
        } as ActionItem,
      ],
      "u",
      "m",
    );
    expect(row.quote).toHaveLength(500);
    expect(row.first_step).toHaveLength(500);
  });
});

describe("sortTasks", () => {
  it("puts open before done, then high priority, then newest", () => {
    const out = sortTasks([
      task({ id: "done-high", status: "done", priority: "high" }),
      task({ id: "open-low", priority: "low" }),
      task({ id: "open-high-old", priority: "high", createdAt: "2026-01-01T00:00:00Z" }),
      task({ id: "open-high-new", priority: "high", createdAt: "2026-09-01T00:00:00Z" }),
    ]);
    expect(out.map((t) => t.id)).toEqual(["open-high-new", "open-high-old", "open-low", "done-high"]);
  });
  it("does not mutate the input", () => {
    const input = [task({ id: "a", priority: "low" }), task({ id: "b", priority: "high" })];
    sortTasks(input);
    expect(input.map((t) => t.id)).toEqual(["a", "b"]);
  });
});

describe("filterTasks", () => {
  const tasks = [task({ id: "1" }), task({ id: "2", status: "done" }), task({ id: "3", owner: "Marcus" })];
  it("filters by status", () => {
    expect(filterTasks(tasks, "open").map((t) => t.id)).toEqual(["1", "3"]);
    expect(filterTasks(tasks, "done").map((t) => t.id)).toEqual(["2"]);
    expect(filterTasks(tasks, "all")).toHaveLength(3);
  });
  it("filters by owner, treating null as Unassigned", () => {
    expect(filterTasks(tasks, "all", "Marcus").map((t) => t.id)).toEqual(["3"]);
    expect(filterTasks(tasks, "all", "Unassigned").map((t) => t.id)).toEqual(["1", "2"]);
  });
});

describe("ownersOf", () => {
  it("lists owners alphabetically with Unassigned last", () => {
    expect(ownersOf([task({ owner: "Zoe" }), task({ owner: null }), task({ owner: "Amir" })])).toEqual(["Amir", "Zoe", "Unassigned"]);
  });
  it("omits Unassigned when everything has an owner", () => {
    expect(ownersOf([task({ owner: "Amir" })])).toEqual(["Amir"]);
  });
});

describe("kindLabel", () => {
  it("reads follow_up as words", () => {
    expect(kindLabel("follow_up")).toBe("follow up");
    expect(kindLabel("bug")).toBe("bug");
  });
});

describe("due_at is resolved once, at extraction", () => {
  it("pins the words to a moment", () => {
    // A Tuesday.
    const now = new Date(2026, 8, 8, 14, 30);
    const [row] = actionItemsToRows(
      [{ title: "Ship it", details: "", owner: null, due: "Thursday", priority: "high", kind: "task", quote: null, first_step: null }],
      "u1",
      "m1",
      now,
    );
    expect(row.due).toBe("Thursday");
    expect(new Date(row.due_at!).getDay()).toBe(4);
  });

  it("leaves it null when nothing concrete was said, rather than inventing one", () => {
    const [row] = actionItemsToRows(
      [{ title: "Ship it", details: "", owner: null, due: "when we get to it", priority: "low", kind: "task", quote: null, first_step: null }],
      "u1",
      "m1",
      new Date(2026, 8, 8),
    );
    expect(row.due_at).toBeNull();
  });
});

describe("personToEmail", () => {
  const people = [
    { name: "Priya", role: "Figma contact", why: "Missing icons." },
    { name: "Marcus", role: "Owner", why: "Payment webhook." },
    { name: "Sam", role: null, why: "API change." },
  ];
  const t = (over: Partial<Parameters<typeof personToEmail>[0]>) =>
    personToEmail({ title: "", details: null, owner: null, kind: "task", ...over }, people);

  it("finds the person on the task the extractor mislabelled", () => {
    // The real case: kind came back "task", not "follow_up", so kind alone
    // would have offered a ticket for an email.
    expect(t({ title: "Email Priya at Figma about missing icons", owner: "Naveen", kind: "task" })).toBe("Priya");
  });

  it("takes a follow-up at its word even with no contact verb", () => {
    expect(t({ title: "Priya, dark mode icons", kind: "follow_up" })).toBe("Priya");
  });

  it("leaves ordinary work as a ticket", () => {
    expect(t({ title: "Fix export crash", owner: "Naveen" })).toBeNull();
    expect(t({ title: "Deliver payment webhook", owner: "Marcus" })).toBeNull();
  });

  it("does not offer to write to somebody merely named in the task", () => {
    // Reviewing someone's work is not writing to them.
    expect(t({ title: "Review Priya's pull request" })).toBeNull();
  });

  it("never offers to email the person doing the task", () => {
    expect(t({ title: "Marcus to chase the payment webhook", owner: "Marcus" })).toBeNull();
  });

  it("matches whole names only", () => {
    expect(t({ title: "Email Samantha about the rollout" })).toBeNull();
    expect(t({ title: "Email Sam about the rollout" })).toBe("Sam");
  });

  it("ignores people the meeting never flagged", () => {
    expect(personToEmail({ title: "Email Jordan about the demo", details: null, owner: null, kind: "task" }, people)).toBeNull();
  });

  it("returns null when nobody was flagged at all", () => {
    expect(personToEmail({ title: "Email Priya about icons", details: null, owner: null, kind: "task" }, [])).toBeNull();
  });
});

describe("tasksOwnedBy", () => {
  const mine = task({ id: "a", owner: "Naveen" });
  const theirs = task({ id: "b", owner: "Marcus" });
  const nobody = task({ id: "c", owner: null });

  it("keeps my tasks and drops other people's", () => {
    const out = tasksOwnedBy([mine, theirs, nobody], "Naveen").map((t) => t.id);
    expect(out).toContain("a");
    expect(out).not.toContain("b");
  });

  it("keeps unclaimed work, which is not somebody else's", () => {
    expect(tasksOwnedBy([mine, theirs, nobody], "Naveen").map((t) => t.id)).toContain("c");
  });

  it("ignores case and stray spaces in a name", () => {
    expect(tasksOwnedBy([task({ id: "a", owner: " naveen " })], "Naveen")).toHaveLength(1);
  });

  it("shows everything when no name is set, rather than an empty page", () => {
    expect(tasksOwnedBy([mine, theirs, nobody], null)).toHaveLength(3);
    expect(tasksOwnedBy([mine, theirs, nobody], "   ")).toHaveLength(3);
  });
});
