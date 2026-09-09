import type { MeetingNotes, TranscriptSegment } from "@/lib/schema";
import { formatTimestamp } from "@/lib/transcript";
import { kindLabel, type TaskKind } from "@/lib/task";
import { PeopleToContact } from "./people-actions";

/**
 * What this meeting means for the person who recorded it. Rendered first
 * because it is the part they will act on; hidden entirely when every list is
 * empty, which is the honest state for a meeting that was not about them.
 * Notes written before this section existed have no for_you and render as
 * they always did.
 */
function ForYouPanel({ fy }: { fy: MeetingNotes["for_you"] | undefined }) {
  if (!fy) return null;
  const groups = (
    [
      ["You said you would", fy.committed],
      ["Asked of you", fy.asked_of_you],
      ["Heads-up", fy.heads_up],
      ["You were mentioned", fy.mentioned],
    ] as [string, string[]][]
  ).filter(([, items]) => items.length > 0);
  if (groups.length === 0) return null;

  return (
    <div className="glass border-accent/40 p-6 md:col-span-2">
      <p className="text-xs text-accent">For you</p>
      <div className="mt-4 grid gap-5 sm:grid-cols-2">
        {groups.map(([title, items]) => (
          <div key={title}>
            <p className="text-sm font-medium">{title}</p>
            <ul className="mt-2 space-y-1.5 text-sm text-muted">
              {items.map((t, i) => (
                <li key={i} className="flex gap-3">
                  <span className="text-faint" aria-hidden>—</span>
                  <span>{t}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

export function NotesView({ notes, meetingId }: { notes: MeetingNotes; meetingId?: string }) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <ForYouPanel fy={notes.for_you} />

      <div className="glass p-6 md:col-span-2">
        <p className="text-xs text-muted">Summary</p>
        <p className="mt-3 leading-relaxed">{notes.summary}</p>
        {notes.key_points.length ? (
          <ul className="mt-5 space-y-2 border-t border-panel-border pt-5 text-sm">
            {notes.key_points.map((k, i) => (
              <li key={i} className="flex gap-3 text-muted">
                <span className="text-faint" aria-hidden>—</span>
                <span>{k}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <div className="glass p-6">
        <div className="flex items-baseline justify-between">
          <p className="text-xs text-muted">Action items</p>
          <span className="font-mono text-sm text-faint">{notes.action_items.length}</span>
        </div>
        <ul className="mt-4 divide-y divide-panel-border">
          {notes.action_items.map((a, i) => (
            <li key={i} className="py-3 first:pt-0 last:pb-0">
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-medium leading-snug">{a.title}</p>
                {a.priority === "high" ? <span className="pill pill-danger flex-none">high</span> : null}
              </div>
              {a.details ? <p className="mt-1.5 text-sm leading-relaxed text-muted">{a.details}</p> : null}
              <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-faint">
                <span>{a.owner ?? "unassigned"}</span>
                <span>{kindLabel(a.kind as TaskKind)}</span>
                {a.due ? <span className="text-warn">due {a.due}</span> : null}
              </p>
            </li>
          ))}
          {notes.action_items.length === 0 ? <li className="py-3 text-sm text-muted">Nothing to do came out of this one.</li> : null}
        </ul>
      </div>

      <div className="flex flex-col gap-3">
        <div className="glass p-6">
          <p className="text-xs text-muted">Decisions</p>
          <ul className="mt-4 space-y-3 text-sm">
            {notes.decisions.map((d, i) => (
              <li key={i}>
                <p className="font-medium">{d.decision}</p>
                <p className="mt-0.5 text-muted">{d.context}</p>
              </li>
            ))}
            {notes.decisions.length === 0 ? <li className="text-muted">None recorded.</li> : null}
          </ul>
        </div>

        {meetingId ? (
          <PeopleToContact meetingId={meetingId} people={notes.people_to_contact} />
        ) : (
          <div className="glass p-6">
            <p className="text-xs text-muted">People to contact</p>
            <ul className="mt-4 divide-y divide-panel-border text-sm">
              {notes.people_to_contact.map((p, i) => (
                <li key={i} className="py-3 first:pt-0 last:pb-0">
                  <p className="font-medium">
                    {p.name}
                    {p.role ? <span className="font-normal text-faint"> · {p.role}</span> : null}
                  </p>
                  <p className="mt-0.5 text-muted">{p.why}</p>
                </li>
              ))}
              {notes.people_to_contact.length === 0 ? <li className="py-3 text-muted">Nobody flagged.</li> : null}
            </ul>
          </div>
        )}

        <div className="glass p-6">
          <p className="text-xs text-muted">Open questions</p>
          <ul className="mt-4 space-y-2 text-sm text-muted">
            {notes.open_questions.map((q, i) => (
              <li key={i} className="flex gap-3">
                <span className="text-faint" aria-hidden>—</span>
                <span>{q}</span>
              </li>
            ))}
            {notes.open_questions.length === 0 ? <li>None.</li> : null}
          </ul>
        </div>
      </div>
    </div>
  );
}

export function TranscriptView({ segments }: { segments: TranscriptSegment[] }) {
  const speakers = Array.from(new Set(segments.map((s) => s.speaker)));

  return (
    <details className="glass p-6">
      <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-medium">
        <span>Transcript</span>
        <span className="text-xs text-faint">{segments.length} segments · {speakers.length} speakers</span>
      </summary>
      <div className="mt-5 space-y-3 border-t border-panel-border pt-5 text-sm leading-relaxed">
        {segments.map((s, i) => (
          <p key={i} className="flex gap-4">
            <span className="w-10 flex-none pt-0.5 text-right font-mono text-xs text-faint">{formatTimestamp(s.start)}</span>
            <span>
              <span className="font-medium">{s.speaker}</span>
              <span className="text-faint"> · </span>
              <span className="text-muted">{s.text}</span>
            </span>
          </p>
        ))}
      </div>
    </details>
  );
}
