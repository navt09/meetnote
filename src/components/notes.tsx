import type { MeetingNotes, TranscriptSegment } from "@/lib/schema";
import { formatTimestamp } from "@/lib/transcript";

const KIND_ICON: Record<string, string> = { bug: "◆", feature: "✦", task: "▸", follow_up: "↗", other: "•" };

export function NotesView({ notes }: { notes: MeetingNotes }) {
  return (
    <div className="stagger grid gap-4 md:grid-cols-2">
      <div className="glass glass-lit p-6 md:col-span-2">
        <span className="pill">Summary</span>
        <p className="mt-4 leading-relaxed text-muted">{notes.summary}</p>
        {notes.key_points.length ? (
          <ul className="mt-5 space-y-2 text-sm">
            {notes.key_points.map((k, i) => (
              <li key={i} className="flex gap-2.5">
                <span className="mt-2 h-1 w-1 flex-none rounded-full bg-accent" />
                <span>{k}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <div className="glass p-6">
        <div className="flex items-center justify-between">
          <span className="pill">Action items</span>
          <span className="font-mono text-2xl font-semibold text-accent">{notes.action_items.length}</span>
        </div>
        <ul className="mt-4 space-y-3">
          {notes.action_items.map((a, i) => (
            <li
              key={i}
              className="rise rounded-xl border border-panel-border bg-black/25 p-3.5 transition-colors hover:border-accent/30"
              style={{ animationDelay: `${120 + i * 60}ms` }}
            >
              <div className="flex items-start justify-between gap-3">
                <p className="font-medium leading-snug">
                  <span className="mr-1.5 text-accent" aria-hidden>{KIND_ICON[a.kind] ?? "•"}</span>
                  {a.title}
                </p>
                <span className={`pill flex-none ${a.priority === "high" ? "pill-danger" : ""}`}>{a.priority}</span>
              </div>
              {a.details ? <p className="mt-1.5 text-sm leading-relaxed text-muted">{a.details}</p> : null}
              <p className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                <span className="rounded-md bg-white/5 px-1.5 py-0.5">{a.owner ?? "unassigned"}</span>
                <span>{a.kind.replace("_", " ")}</span>
                {a.due ? <span className="text-warn">due {a.due}</span> : null}
              </p>
            </li>
          ))}
          {notes.action_items.length === 0 ? <li className="text-sm text-muted">Nothing to do came out of this one.</li> : null}
        </ul>
      </div>

      <div className="flex flex-col gap-4">
        <div className="glass p-6">
          <span className="pill">Decisions</span>
          <ul className="mt-4 space-y-3 text-sm">
            {notes.decisions.map((d, i) => (
              <li key={i} className="border-l-2 border-accent-2/50 pl-3">
                <span className="font-medium">{d.decision}</span>
                <span className="mt-0.5 block text-muted">{d.context}</span>
              </li>
            ))}
            {notes.decisions.length === 0 ? <li className="text-muted">None recorded.</li> : null}
          </ul>
        </div>

        <div className="glass p-6">
          <span className="pill">People to contact</span>
          <ul className="mt-4 space-y-3 text-sm">
            {notes.people_to_contact.map((p, i) => (
              <li key={i} className="flex gap-3">
                <span className="grid h-8 w-8 flex-none place-items-center rounded-full bg-gradient-to-br from-accent/25 to-accent-2/25 text-xs font-semibold">
                  {p.name.trim().charAt(0).toUpperCase() || "?"}
                </span>
                <span>
                  <span className="font-medium">{p.name}</span>
                  {p.role ? <span className="text-muted"> · {p.role}</span> : null}
                  <span className="block text-muted">{p.why}</span>
                </span>
              </li>
            ))}
            {notes.people_to_contact.length === 0 ? <li className="text-muted">Nobody flagged.</li> : null}
          </ul>
        </div>

        <div className="glass p-6">
          <span className="pill">Open questions</span>
          <ul className="mt-4 space-y-2 text-sm">
            {notes.open_questions.map((q, i) => (
              <li key={i} className="flex gap-2.5">
                <span className="flex-none text-accent-2">?</span>
                <span>{q}</span>
              </li>
            ))}
            {notes.open_questions.length === 0 ? <li className="text-muted">None.</li> : null}
          </ul>
        </div>
      </div>
    </div>
  );
}

export function TranscriptView({ segments }: { segments: TranscriptSegment[] }) {
  const speakers = Array.from(new Set(segments.map((s) => s.speaker)));
  const colour = (s: string) => ["text-accent", "text-accent-2", "text-ok", "text-warn"][speakers.indexOf(s) % 4];

  return (
    <details className="glass group p-6">
      <summary className="flex cursor-pointer list-none items-center justify-between font-semibold">
        <span>Transcript</span>
        <span className="pill">{segments.length} segments · {speakers.length} speakers</span>
      </summary>
      <div className="mt-5 space-y-3 text-sm leading-relaxed">
        {segments.map((s, i) => (
          <p key={i} className="flex gap-3">
            <span className="w-12 flex-none pt-0.5 text-right font-mono text-xs text-muted">{formatTimestamp(s.start)}</span>
            <span>
              <span className={`font-medium ${colour(s.speaker)}`}>{s.speaker}</span>
              <span className="text-muted"> — </span>
              {s.text}
            </span>
          </p>
        ))}
      </div>
    </details>
  );
}
