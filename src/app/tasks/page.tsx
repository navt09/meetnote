import { supabaseServer } from "@/lib/supabase/server";
import { tierFor } from "@/lib/account-store";
import { sortTasks, tasksOwnedBy, toPublicTask, type ContactPerson, type TaskRow } from "@/lib/task";
import { dueLabel, isOverdue, parseDue } from "@/lib/schedule";
import { getDisplayName } from "@/lib/settings-store";
import { emailDraftKey } from "@/lib/draft";
import { ticketDestinationFor } from "@/lib/connector-store";
import { NO_TICKET_DESTINATION } from "@/lib/ticket-destination";
import TasksView from "./tasks-view";

export const dynamic = "force-dynamic";
export const metadata = { title: "Tasks · From the Call" };

type Joined = TaskRow & { meetings: { title: string } | null };

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<{ task?: string }>;
}) {
  // Read here rather than with useSearchParams, so the view can derive its
  // opening state from it instead of setting state inside an effect.
  const { task: requestedTaskId } = await searchParams;
  const db = await supabaseServer();
  const { data: userData } = await db.auth.getUser();

  // The tier rides down with the rows so the page knows, on its first render,
  // which of the per-task actions it may offer at all.
  const [tasksRes, draftsRes, tier, displayName, ticketDestination] = await Promise.all([
    db.from("tasks").select("*, meetings(title)").order("created_at", { ascending: false }).limit(500),
    // Both kinds: a ticket is recognised by its task, an email by who it is
    // for, so the rows can say which follow-ups already exist.
    db.from("drafts").select("task_id,kind,meeting_id,recipient").limit(500),
    userData.user ? tierFor(userData.user.id, userData.user.email) : Promise.resolve("free" as const),
    userData.user ? getDisplayName(userData.user.id) : Promise.resolve(null),
    // Where a ticket would actually go, so the button can say so instead of
    // saying "draft ticket" whether or not anything would ever receive it.
    userData.user ? ticketDestinationFor(userData.user.id) : Promise.resolve(NO_TICKET_DESTINATION),
  ]);

  // Narrowed to this person before anything else is derived from it, so the
  // counts, the deadline column and the row list cannot disagree about whose
  // page this is. A meeting's own notes still show everybody's, which is what
  // you want when you are reading the meeting rather than working through it.
  const everyones = ((tasksRes.data ?? []) as Joined[]).map((r) => toPublicTask(r, r.meetings?.title ?? "Untitled meeting"));
  const tasks = sortTasks(tasksOwnedBy(everyones, displayName));
  const hiddenFromOthers = everyones.length - tasks.length;
  const draftRows = (draftsRes.data ?? []) as { task_id: string | null; kind: string; meeting_id: string; recipient: string | null }[];
  const drafted = draftRows.map((d) => d.task_id).filter((id): id is string => !!id);
  const emailedKeys = draftRows
    .filter((d) => d.kind === "email" && d.recipient)
    .map((d) => emailDraftKey(d.meeting_id, d.recipient as string));

  // Who each task's meeting said to contact, so a row that means "email
  // Priya" can offer the email. Only that one column is selected, and only
  // for the meetings actually on the page: whole notes rows are large and
  // none of the rest of them is used here.
  const meetingIds = [...new Set(tasks.map((t) => t.meetingId))];
  const peopleRes = meetingIds.length
    ? await db.from("meetings").select("id,people:notes->people_to_contact").in("id", meetingIds)
    : null;
  const people: Record<string, ContactPerson[]> = Object.fromEntries(meetingIds.map((id) => [id, []]));
  for (const row of (peopleRes?.data ?? []) as { id: string; people: ContactPerson[] | null }[]) {
    // A meeting still processing has no notes at all, so the column is null.
    if (Array.isArray(row.people)) people[row.id] = row.people;
  }

  // Deadlines are worked out here rather than in the browser: "Thursday" only
  // means something relative to a clock, and the server's is the one the rest
  // of the page was rendered against. Every task is dated, not just the open
  // ones, because the row and the list both read these labels and must never
  // disagree about the same deadline. Sorted soonest first, overdue at the top.
  const now = new Date();
  const due = tasks
    .flatMap((t) => {
      // The moment resolved when the task was written. Tasks created before
      // that column existed still have only the words, so they are parsed
      // here as a fallback.
      const stored = t.dueAt ? new Date(t.dueAt) : null;
      const at = stored && !Number.isNaN(stored.getTime()) ? stored : parseDue(t.due, now);
      return at ? [{ id: t.id, at, label: dueLabel(at, now), overdue: isOverdue(at, now) }] : [];
    })
    .sort((a, b) => a.at.getTime() - b.at.getTime())
    .map(({ id, label, overdue }) => ({ id, label, overdue }));

  return (
    <TasksView
      initial={tasks}
      drafted={drafted}
      emailedKeys={emailedKeys}
      people={people}
      me={displayName}
      hiddenFromOthers={hiddenFromOthers}
      requestedTaskId={requestedTaskId ?? null}
      tier={tier}
      ticketDestination={ticketDestination}
      due={due}
      loadError={tasksRes.error ? "Could not load your tasks. Refresh to try again." : null}
    />
  );
}
