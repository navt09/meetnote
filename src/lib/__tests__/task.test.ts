import { describe, expect, it } from "vitest";
import { actionItemsToRows, filterTasks, kindLabel, ownersOf, sortTasks, type PublicTask } from "../task";
import type { ActionItem } from "../schema";

const task = (over: Partial<PublicTask>): PublicTask => ({
  id: "t", meetingId: "m", meetingTitle: "Standup", title: "T", details: "", owner: null, due: null,
  priority: "medium", kind: "task", status: "open", completedAt: null, createdAt: "2026-09-01T00:00:00Z",
  calendarEventUrl: null, ...over,
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
