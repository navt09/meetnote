import type { MeetingNotes, TranscriptSegment } from "@/lib/schema";
import { formatTimestamp } from "@/lib/transcript";
import { kindLabel, type TaskKind, type TaskPriority } from "@/lib/task";
import { PeopleToContact } from "./people-actions";
import { ActionItems } from "./action-items";
import { ShareToSlack } from "./share-slack";
import Link from "next/link";
import { PRIORITY_STRIPE, PriorityTag } from "./priority";

/**
 * Colour here is semantic, never decorative: it is the status tokens doing the
 * job they are reserved for. Priority is the one thing on this page a person
 * scans for, so it gets a stripe down the side of the row as well as a label —
 * the stripe is what you can read without stopping to read.
 */
/**
 * A section heading with real weight. These used to be small grey labels
 * identical across every panel, which is what made the sections read as one
 * undifferentiated block.
 */
function SectionHead({ title, count, hint }: { title: string; count?: number; hint?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-panel-border pb-3">
      <h2 className="font-display text-base font-semibold tracking-tight">{title}</h2>
      {typeof count === "number" ? <span className="font-mono text-xs text-faint">{count}</span> : null}
      {hint ? <span className="text-xs text-faint">{hint}</span> : null}
    </div>
  );
}

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
    <section className="glass border-accent/50 p-6">
      <div className="flex items-baseline justify-between gap-3 border-b border-accent/25 pb-3">
        <h2 className="font-display text-base font-semibold tracking-tight text-accent">For you</h2>
        <span className="text-xs text-faint">from your own lines</span>
      </div>
      <div className="mt-4 grid gap-5 sm:grid-cols-2">
        {groups.map(([title, items]) => (
          <div key={title}>
            <p className="text-sm font-medium">{title}</p>
            <ul className="mt-2 flex flex-col gap-1.5 text-sm text-muted">
              {items.map((t, i) => (
                <li key={i} className="flex gap-2.5">
                  <span aria-hidden className="mt-[0.55rem] h-1 w-1 shrink-0 rounded-full bg-accent" />
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
    <div className="flex flex-col gap-4">
      <ForYouPanel fy={notes.for_you} />

      {/* ---- summary ---- */}
      <section className="glass p-6">
        <SectionHead title="Summary" />
        <p className="mt-4 leading-relaxed">{notes.summary}</p>
        {meetingId ? <ShareToSlack meetingId={meetingId} /> : null}
        {notes.key_points.length ? (
          <ul className="mt-5 flex flex-col gap-2 border-t border-panel-border pt-5 text-sm">
            {notes.key_points.map((k, i) => (
              <li key={i} className="flex gap-3 text-muted">
                <span aria-hidden className="mt-[0.55rem] h-1 w-1 shrink-0 rounded-full bg-faint" />
                <span>{k}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      {/* ---- action items: the point of the page, so it gets the full width ---- */}
      <section className="glass p-6">
        <div className="flex items-baseline justify-between gap-3 border-b border-panel-border pb-3">
          <h2 className="font-display text-base font-semibold tracking-tight">Action items</h2>
          <span className="flex items-baseline gap-3">
            <span className="font-mono text-xs text-faint">{notes.action_items.length}</span>
            <Link href="/tasks" className="text-xs text-muted transition-colors hover:text-fg">All tasks &rarr;</Link>
          </span>
        </div>
        {meetingId ? (
          <ActionItems meetingId={meetingId} fallback={notes.action_items} />
        ) : notes.action_items.length === 0 ? (
          <p className="mt-4 text-sm text-muted">Nothing to do came out of this one.</p>
        ) : (
          <ul className="mt-4 flex flex-col gap-2.5">
            {notes.action_items.map((a, i) => (
              <li
                key={i}
                className="rounded-lg border border-panel-border bg-bg-elev p-4"
                style={{ borderLeftWidth: "3px", borderLeftColor: PRIORITY_STRIPE[a.priority as TaskPriority] }}
              >
                <p className="font-medium leading-snug">{a.title}</p>
                {a.details ? <p className="mt-1 text-sm leading-relaxed text-muted">{a.details}</p> : null}
                <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                  <PriorityTag priority={a.priority as TaskPriority} />
                  <span className={a.owner ? "font-medium text-fg" : "text-faint"}>{a.owner ?? "Unassigned"}</span>
                  <span className="text-faint">{kindLabel(a.kind as TaskKind)}</span>
                  {a.due ? <span className="text-warn">due {a.due}</span> : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ---- settled vs unsettled, side by side ---- */}
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="glass p-6">
          <SectionHead title="Decisions" count={notes.decisions.length} />
          {notes.decisions.length === 0 ? (
            <p className="mt-4 text-sm text-muted">None recorded.</p>
          ) : (
            <ul className="mt-4 flex flex-col gap-3.5 text-sm">
              {notes.decisions.map((d, i) => (
                <li key={i} className="border-l-2 border-ok/60 pl-3.5">
                  <p className="font-medium leading-snug">{d.decision}</p>
                  <p className="mt-1 leading-relaxed text-muted">{d.context}</p>
                </li>
              ))}
            </ul>
          )}
        </section>

        {meetingId ? (
          <PeopleToContact meetingId={meetingId} people={notes.people_to_contact} />
        ) : (
          <section className="glass p-6">
            <SectionHead title="People to contact" count={notes.people_to_contact.length} />
            {notes.people_to_contact.length === 0 ? (
              <p className="mt-4 text-sm text-muted">Nobody flagged.</p>
            ) : (
              <ul className="mt-4 flex flex-col gap-3.5 text-sm">
                {notes.people_to_contact.map((p, i) => (
                  <li key={i} className="border-l-2 border-accent/50 pl-3.5">
                    <p className="font-medium leading-snug">
                      {p.name}
                      {p.role ? <span className="font-normal text-faint"> · {p.role}</span> : null}
                    </p>
                    <p className="mt-1 leading-relaxed text-muted">{p.why}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </div>

      {/* ---- what nobody settled ---- */}
      {notes.open_questions.length ? (
        <section className="glass p-6">
          <SectionHead title="Open questions" count={notes.open_questions.length} hint="nobody answered these" />
          <ul className="mt-4 flex flex-col gap-2.5 text-sm">
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
    <details className="glass mt-4 p-6">
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
