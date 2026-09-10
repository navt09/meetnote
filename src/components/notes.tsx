import type { MeetingNotes, TranscriptSegment } from "@/lib/schema";
import { formatTimestamp } from "@/lib/transcript";
import { kindLabel, type TaskKind, type TaskPriority } from "@/lib/task";
import { PeopleToContact } from "./people-actions";
import { ActionItems } from "./action-items";
import { ShareToSlack } from "./share-slack";
import Link from "next/link";
import { PriorityFlag } from "./priority";

/**
 * Colour here is semantic, never decorative: it is the status tokens doing the
 * job they are reserved for. Priority is the one thing on this page a person
 * scans for, so it gets a stripe down the side of the row as well as a label —
 * the stripe is what you can read without stopping to read.
 */
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
    <section className="rounded-xl border border-panel-border-hi bg-panel-hi p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-display text-base font-semibold">For you</h2>
        <span className="text-xs text-faint">from your own lines</span>
      </div>
      <div className="mt-3 grid gap-5 sm:grid-cols-2">
        {groups.map(([title, items]) => (
          <div key={title}>
            <p className="text-sm font-medium">{title}</p>
            <ul className="mt-2 flex flex-col gap-1.5 text-sm text-muted">
              {items.map((t, i) => (
                <li key={i} className="flex gap-2.5">
                  <span aria-hidden className="mt-[0.55rem] h-1 w-1 shrink-0 rounded-full bg-faint" />
                  <span>{t}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

export function NotesView({ notes, meetingId }: { notes: MeetingNotes; meetingId?: string }) {
  return (
    <div className="flex flex-col gap-5">
      <ForYouPanel fy={notes.for_you} />

      {/* ---- what needs doing: the point of the page, so it leads ---- */}
      <section className="band band-work">
        <div className="band-head">
          <h2 className="band-title">Needs doing</h2>
          <span className="flex items-baseline gap-3">
            <span className="band-count">{notes.action_items.length}</span>
            <Link href="/tasks" className="text-xs text-muted transition-colors hover:text-fg">All tasks &rarr;</Link>
          </span>
        </div>
        {meetingId ? (
          <ActionItems meetingId={meetingId} fallback={notes.action_items} />
        ) : notes.action_items.length === 0 ? (
          <p className="band-empty text-sm text-muted">Nothing to do came out of this one.</p>
        ) : (
          <ul className="band-body">
            {notes.action_items.map((a, i) => (
              <li key={i} className="band-row">
                <div className="flex items-start justify-between gap-3">
                  <p className="font-medium leading-snug">{a.title}</p>
                  <PriorityFlag priority={a.priority as TaskPriority} />
                </div>
                {a.details ? <p className="mt-1 text-sm leading-relaxed text-muted">{a.details}</p> : null}
                <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-faint">
                  <span className={a.owner ? "font-medium text-fg" : ""}>{a.owner ?? "Unassigned"}</span>
                  <span>{kindLabel(a.kind as TaskKind)}</span>
                  {a.due ? <span className="font-medium text-warn">due {a.due}</span> : null}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ---- the whole meeting, deliberately uncoloured: it is not one kind
              of thing, it is all of them ---- */}
      <section className="rounded-xl border border-panel-border p-5">
        <h2 className="font-display text-base font-semibold">Summary</h2>
        <p className="mt-2 leading-relaxed text-muted">{notes.summary}</p>
        {notes.key_points.length ? (
          <ul className="mt-4 flex flex-col gap-2 border-t border-panel-border pt-4 text-sm">
            {notes.key_points.map((k, i) => (
              <li key={i} className="flex gap-3 text-muted">
                <span aria-hidden className="mt-[0.55rem] h-1 w-1 shrink-0 rounded-full bg-faint" />
                <span>{k}</span>
              </li>
            ))}
          </ul>
        ) : null}
        {meetingId ? <ShareToSlack meetingId={meetingId} /> : null}
      </section>

      {/* ---- what was settled ---- */}
      <section className="band band-agreed">
        <div className="band-head">
          <h2 className="band-title">Agreed</h2>
          <span className="band-count">{notes.decisions.length}</span>
        </div>
        {notes.decisions.length === 0 ? (
          <p className="band-empty text-sm text-muted">Nothing was settled in this one.</p>
        ) : (
          <ul className="band-body">
            {notes.decisions.map((d, i) => (
              <li key={i} className="band-row">
                <p className="font-medium leading-snug">{d.decision}</p>
                <p className="mt-1 text-sm leading-relaxed text-muted">{d.context}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ---- who to talk to ---- */}
      {meetingId ? (
        <PeopleToContact meetingId={meetingId} people={notes.people_to_contact} />
      ) : (
        <section className="band band-people">
          <div className="band-head">
            <h2 className="band-title">People to contact</h2>
            <span className="band-count">{notes.people_to_contact.length}</span>
          </div>
          {notes.people_to_contact.length === 0 ? (
            <p className="band-empty text-sm text-muted">Nobody was flagged.</p>
          ) : (
            <ul className="band-body">
              {notes.people_to_contact.map((p, i) => (
                <li key={i} className="band-row">
                  <p className="font-medium leading-snug">
                    {p.name}
                    {p.role ? <span className="font-normal text-faint"> &middot; {p.role}</span> : null}
                  </p>
                  <p className="mt-1 text-sm leading-relaxed text-muted">{p.why}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* ---- what nobody settled ---- */}
      {notes.open_questions.length ? (
        <section className="rounded-xl border border-panel-border p-5">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="font-display text-base font-semibold">Open questions</h2>
            <span className="text-xs text-faint">nobody answered these</span>
          </div>
          <ul className="mt-3 flex flex-col gap-2.5 text-sm">
            {notes.open_questions.map((q, i) => (
              <li key={i} className="flex gap-3 text-muted">
                <span aria-hidden className="mt-px shrink-0 font-mono text-faint">?</span>
                <span>{q}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

export function TranscriptView({ segments }: { segments: TranscriptSegment[] }) {
  const speakers = Array.from(new Set(segments.map((s) => s.speaker)));

  return (
    <details className="mt-5 rounded-xl border border-panel-border p-5">
      <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-medium">
        <span>Transcript</span>
        <span className="text-xs text-faint">{segments.length} segments · {speakers.length} speakers</span>
      </summary>
      <div className="mt-5 flex flex-col gap-3 border-t border-panel-border pt-5 text-sm leading-relaxed">
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
