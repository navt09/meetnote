import type { ActionItem } from "./schema";
import { parseDue } from "./schedule";
import { quoteContext, type QuoteContext } from "./quote-context";
import type { TranscriptSegment } from "./schema";

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
  /** The deadline as a moment, resolved when the task was written. */
  due_at: string | null;
  priority: TaskPriority;
  kind: TaskKind;
  /** The transcript line this task came from, verbatim. Null when none fits. */
  quote: string | null;
  /** A suggested place to start, from the discussion. Null when it gave none. */
  first_step: string | null;
  /** The lines either side of the quote. Null when the quote could not be placed. */
  quote_context: QuoteContext | null;
  /** What the meeting said is in the way, or null. Never updated afterwards. */
  blocked_by: string | null;
  status: TaskStatus;
  completed_at: string | null;
  calendar_event_url: string | null;
  calendar_event_at: string | null;
  /** Set once the task was added to Microsoft To Do. No URL: To Do has no per-task permalink. */
  todo_task_id: string | null;
  todo_added_at: string | null;
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
  /** What the meeting actually said, e.g. "Thursday" or "before the demo". */
  due: string | null;
  /** Those words pinned to a moment when the task was written. */
  dueAt: string | null;
  priority: TaskPriority;
  kind: TaskKind;
  /** What was said that produced this task. Shown as a check, not as prose. */
  quote: string | null;
  /** Where to start, shown as a suggestion and never as something agreed. */
  firstStep: string | null;
  /** What was said either side of the quote, so it can be read in context. */
  quoteContext: QuoteContext | null;
  /** What the meeting said has to happen first. A quote of the meeting, not live state. */
  blockedBy: string | null;
  status: TaskStatus;
  completedAt: string | null;
  createdAt: string;
  /** Set once the task has been blocked out on the calendar. */
  calendarEventUrl: string | null;
  /** True once it is on the reader's Microsoft To Do list. Not a link: there is none to give. */
  onTodo: boolean;
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
    dueAt: row.due_at ?? null,
    priority: row.priority,
    kind: row.kind,
    // Rows written before these columns existed have neither, so undefined is
    // flattened to null and the UI has one absent case to handle, not two.
    quote: row.quote ?? null,
    firstStep: row.first_step ?? null,
    quoteContext: row.quote_context ?? null,
    blockedBy: row.blocked_by ?? null,
    status: row.status,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    calendarEventUrl: row.calendar_event_url ?? null,
    onTodo: !!row.todo_task_id,
  };
}

const PRIORITIES: TaskPriority[] = ["low", "medium", "high"];
const KINDS: TaskKind[] = ["bug", "feature", "task", "follow_up", "other"];

/**
 * Turns extracted action items into rows ready to insert. Defensive about bad
 * values.
 *
 * `due` keeps the words from the meeting; `due_at` pins them to a moment using
 * `now`, which is the clock at extraction. Resolving the phrase again later is
 * what made deadlines walk forward for ever, so it is resolved exactly once.
 *
 * `segments` is the transcript the items were extracted from, used only to
 * find the lines either side of each quote. It is optional because the rows
 * are valid without it; a caller that has no transcript simply writes tasks
 * whose quotes stand alone.
 */
export function actionItemsToRows(
  items: ActionItem[],
  userId: string,
  meetingId: string,
  now: Date = new Date(),
  segments: TranscriptSegment[] = [],
) {
  return items.map((a, idx) => ({
    user_id: userId,
    meeting_id: meetingId,
    idx,
    title: (a.title ?? "").trim().slice(0, 300) || "Untitled task",
    details: (a.details ?? "").trim().slice(0, 2000),
    owner: a.owner?.trim() ? a.owner.trim().slice(0, 120) : null,
    due: a.due?.trim() ? a.due.trim().slice(0, 120) : null,
    due_at: parseDue(a.due, now)?.toISOString() ?? null,
    // The prompt asks for about 200 characters of transcript; the bound is
    // generous over that, because a quote cut mid-sentence is still a quote,
    // and a run-on one is a paragraph nobody will read.
    quote: a.quote?.trim() ? a.quote.trim().slice(0, 500) : null,
    first_step: a.first_step?.trim() ? a.first_step.trim().slice(0, 500) : null,
    // Matched against the transcript here, where both are in hand. Stored
    // rather than looked up later, because /tasks shows work from many
    // meetings at once and would otherwise fetch a transcript per row.
    quote_context: quoteContext(a.quote, segments),
    blocked_by: a.blocked_by?.trim() ? a.blocked_by.trim().slice(0, 300) : null,
    priority: (PRIORITIES as string[]).includes(a.priority) ? a.priority : "medium",
    kind: (KINDS as string[]).includes(a.kind) ? a.kind : "task",
  }));
}

/** A person the meeting said to contact, as stored in notes.people_to_contact. */
export type ContactPerson = { name: string; role: string | null; why: string };

/** Words that mean "get in touch with", as opposed to merely mentioning someone. */
const CONTACT_INTENT =
  /\b(e-?mail(?:s|ing)?|call(?:s|ing)?|message(?:s|ing)?|ping|contact|chase|write to|reach out|follow(?:ing)? up|get back to|send)\b/i;

/**
 * Whether `name` appears in `text` as a whole word.
 *
 * Scanned rather than compiled into a RegExp, because the name comes out of a
 * transcript: a name carrying a bracket would either throw or quietly match
 * something nobody meant.
 */
function namedIn(text: string, name: string): boolean {
  const haystack = text.toLowerCase();
  const needle = name.toLowerCase();
  const isWordChar = (c: string) => c !== "" && /[a-z0-9]/.test(c);

  for (let from = 0; ; ) {
    const at = haystack.indexOf(needle, from);
    if (at === -1) return false;
    const before = at === 0 ? "" : haystack[at - 1];
    const after = at + needle.length >= haystack.length ? "" : haystack[at + needle.length];
    if (!isWordChar(before) && !isWordChar(after)) return true;
    from = at + 1;
  }
}

/**
 * The person to write to, when a task is really "tell someone something".
 *
 * A ticket is the wrong offer for "Email Priya at Figma about the icons", and
 * that is exactly what the product offered: the extractor had labelled it a
 * plain task rather than a follow-up, so keying off `kind` alone missed it.
 * The reliable signal is in the words: the task names somebody the meeting
 * separately flagged as needing contact, and says to get in touch with them.
 *
 * Only the title is searched. Details often mention several people in passing,
 * and a name in passing is not an instruction to write to them. The owner is
 * skipped too: they are the one doing the task, not the one written to.
 */
export function personToEmail(
  task: { title: string; details?: string | null; owner: string | null; kind: TaskKind },
  people: ContactPerson[],
): string | null {
  const title = task.title ?? "";
  // A follow-up already declares its intent; anything else has to say so.
  if (task.kind !== "follow_up" && !CONTACT_INTENT.test(title)) return null;

  const owner = (task.owner ?? "").trim().toLowerCase();
  for (const person of people) {
    const name = (person.name ?? "").trim();
    if (name.length < 2 || name.toLowerCase() === owner) continue;
    if (namedIn(title, name)) return name;
  }
  return null;
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

/**
 * The tasks that belong to this person: the ones they own, plus the ones
 * nobody claimed.
 *
 * Unassigned work is included deliberately. A task with no owner is not
 * somebody else's, and leaving it out would mean the only place it ever
 * appeared was the meeting it came from, which is where things go to be
 * forgotten.
 *
 * With no name set, everything comes back: the alternative is an empty page
 * with no way of telling why.
 */
export function tasksOwnedBy<T extends { owner: string | null }>(tasks: T[], me: string | null): T[] {
  const name = (me ?? "").trim().toLowerCase();
  if (!name) return tasks;
  return tasks.filter((t) => {
    const owner = (t.owner ?? "").trim().toLowerCase();
    return owner === "" || owner === name;
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
