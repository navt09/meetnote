import { describe, it, expect } from "vitest";
import { dateOnly, taskToRow, tasksToRows } from "../excel-rows";
import { COLUMNS } from "../providers/excel";
import type { PublicTask } from "../task";

const task = (over: Partial<PublicTask> = {}): PublicTask => ({
  id: "t1",
  meetingId: "m1",
  meetingTitle: "Standup",
  title: "Fix the export crash",
  details: "",
  owner: "Priya",
  due: "Friday",
  dueAt: null,
  priority: "high",
  kind: "bug",
  status: "open",
  quote: null,
  firstStep: null,
  quoteContext: null,
  blockedBy: null,
  completedAt: null,
  calendarEventUrl: null,
  createdAt: "2026-09-01T00:00:00Z",
  ...over,
});

describe("taskToRow", () => {
  it("carries what the meeting agreed", () => {
    const row = taskToRow(task(), "Weekly standup", "2026-09-11T09:30:00Z");
    expect(row).toEqual({
      meeting: "Weekly standup",
      recorded: "2026-09-11",
      task: "Fix the export crash",
      owner: "Priya",
      due: "Friday",
      priority: "high",
      blockedBy: "",
    });
  });

  it("writes blanks, never the word null", () => {
    // A cell holding "null" reads as a bug in a document somebody will look at
    // for months; an empty one reads as nothing to say.
    const row = taskToRow(task({ due: null, blockedBy: null, owner: null }), "M", "2026-09-11T09:30:00Z");
    expect(row.due).toBe("");
    expect(row.blockedBy).toBe("");
    expect(row.owner).toBe("Unassigned");
    for (const v of Object.values(row)) expect(v).not.toMatch(/null|undefined/);
  });

  it("treats whitespace as absent", () => {
    const row = taskToRow(task({ owner: "   ", due: "  " }), "M", "2026-09-11T09:30:00Z");
    expect(row.owner).toBe("Unassigned");
    expect(row.due).toBe("");
  });

  it("keeps what the meeting said about the deadline, not a resolved date", () => {
    // The same rule as the rest of the product: "Friday" is what was agreed,
    // and re-resolving it later walks the date forward for ever.
    expect(taskToRow(task({ due: "before the demo" }), "M", "2026-09-11T00:00:00Z").due).toBe("before the demo");
  });

  it("has one value per column, in the column order", () => {
    // Eight columns, seven values plus the Added date written at send time.
    const row = taskToRow(task(), "M", "2026-09-11T00:00:00Z");
    expect(Object.keys(row)).toHaveLength(COLUMNS.length - 1);
  });
});

describe("tasksToRows", () => {
  it("keeps the order it was given", () => {
    const rows = tasksToRows([task({ title: "One" }), task({ title: "Two" })], "M", "2026-09-11T00:00:00Z");
    expect(rows.map((r) => r.task)).toEqual(["One", "Two"]);
  });

  it("is empty for no tasks", () => {
    expect(tasksToRows([], "M", "2026-09-11T00:00:00Z")).toEqual([]);
  });
});

describe("dateOnly", () => {
  it("gives Excel a date it can sort", () => {
    // A full timestamp lands as text and neither sorts nor filters.
    expect(dateOnly("2026-09-11T09:30:00Z")).toBe("2026-09-11");
  });

  it("is blank rather than wrong when there is no usable date", () => {
    expect(dateOnly(null)).toBe("");
    expect(dateOnly("")).toBe("");
    expect(dateOnly("not a date")).toBe("");
  });
});
