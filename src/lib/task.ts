import type { ActionItem } from "./schema";

export type TaskStatus = "open" | "done" | "dismissed";
export type TaskPriority = "low" | "medium" | "high";
export type TaskKind = "bug" | "feature" | "task" | "follow_up" | "other";

/** Database row. */
export type TaskRow = {
  id: string;
  user_id: string;
  meeting_id: string;
  idx: number;
  title: string;
  details: string;
  owner: string | null;
  due: string | null;
  priority: TaskPriority;
  kind: TaskKind;
  status: TaskStatus;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

/** What the browser sees. No user_id, no row timestamps. */
export type PublicTask = {
  id: string;
  meetingId: string;
  meetingTitle: string;
  title: string;
  details: string;
  owner: string | null;
  due: string | null;
  priority: TaskPriority;
  kind: TaskKind;
  status: TaskStatus;
  completedAt: string | null;
  createdAt: string;
};

export function toPublicTask(row: TaskRow, meetingTitle: string): PublicTask {
  return {
    id: row.id,
    meetingId: row.meeting_id,
    meetingTitle,
    title: row.title,
    details: row.details,
    owner: row.owner,
    due: row.due,
    priority: row.priority,
    kind: row.kind,
    status: row.status,
    completedAt: row.completed_at,
    createdAt: row.created_at,
  };
}

const PRIORITIES: TaskPriority[] = ["low", "medium", "high"];
const KINDS: TaskKind[] = ["bug", "feature", "task", "follow_up", "other"];

/** Turns extracted action items into rows ready to insert. Defensive about bad values. */
export function actionItemsToRows(items: ActionItem[], userId: string, meetingId: string) {
  return items.map((a, idx) => ({
    user_id: userId,
    meeting_id: meetingId,
    idx,
    title: (a.title ?? "").trim().slice(0, 300) || "Untitled task",
    details: (a.details ?? "").trim().slice(0, 2000),
    owner: a.owner?.trim() ? a.owner.trim().slice(0, 120) : null,
    due: a.due?.trim() ? a.due.trim().slice(0, 120) : null,
    priority: (PRIORITIES as string[]).includes(a.priority) ? a.priority : "medium",
    kind: (KINDS as string[]).includes(a.kind) ? a.kind : "task",
  }));
}

const RANK: Record<TaskPriority, number> = { high: 0, medium: 1, low: 2 };

/** Open first, then by priority, then newest. Stable and pure. */
export function sortTasks(tasks: PublicTask[]): PublicTask[] {
  return [...tasks].sort((a, b) => {
    if (a.status !== b.status) return a.status === "open" ? -1 : 1;
    if (RANK[a.priority] !== RANK[b.priority]) return RANK[a.priority] - RANK[b.priority];
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}

export type TaskFilter = "open" | "done" | "all";

export function filterTasks(tasks: PublicTask[], filter: TaskFilter, owner: string | null = null): PublicTask[] {
  return tasks.filter((t) => {
    if (filter === "open" && t.status !== "open") return false;
    if (filter === "done" && t.status !== "done") return false;
    if (owner && (t.owner ?? "Unassigned") !== owner) return false;
    return true;
  });
}

/** Distinct owners, "Unassigned" last, for the filter chips. */
export function ownersOf(tasks: PublicTask[]): string[] {
  const set = new Set(tasks.map((t) => t.owner ?? "Unassigned"));
  const list = [...set].sort((a, b) => a.localeCompare(b));
  return list.filter((o) => o !== "Unassigned").concat(set.has("Unassigned") ? ["Unassigned"] : []);
}

export const KIND_ICON: Record<TaskKind, string> = {
  bug: "◆",
  feature: "✦",
  task: "▸",
  follow_up: "↗",
  other: "•",
};

export function kindLabel(kind: TaskKind): string {
  return kind === "follow_up" ? "follow up" : kind;
}
