import type { TaskRowValues } from "./providers/excel";
import type { PublicTask } from "./task";

/**
 * Turning tasks into spreadsheet rows.
 *
 * Pure, so what lands in somebody's workbook can be checked without a
 * Microsoft account. Every value is a string: a cell holding an empty string
 * reads as blank, while one holding "null" or "undefined" reads as a bug, and
 * this is a document a person will look at for months.
 *
 * There is deliberately no Status column. A row is appended once and never
 * revisited, so a status written today would be wrong the first time somebody
 * ticked the task off, and a stale column that looks live is worse than no
 * column — the same reason `blocked_by` says what the meeting said and is
 * never updated.
 */

export function taskToRow(task: PublicTask, meetingTitle: string, recordedAt: string): TaskRowValues {
  return {
    meeting: meetingTitle,
    recorded: dateOnly(recordedAt),
    task: task.title,
    owner: task.owner?.trim() || "Unassigned",
    due: task.due?.trim() || "",
    priority: task.priority ?? "",
    blockedBy: task.blockedBy?.trim() || "",
  };
}

export function tasksToRows(tasks: PublicTask[], meetingTitle: string, recordedAt: string): TaskRowValues[] {
  return tasks.map((t) => taskToRow(t, meetingTitle, recordedAt));
}

/**
 * The day, not the instant. Excel reads "2026-09-12" as a date and will sort
 * and filter it; a full ISO timestamp lands as text and does neither.
 */
export function dateOnly(iso: string | null | undefined): string {
  const t = (iso ?? "").trim();
  if (!t) return "";
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}
