import type { MeetingNotes, TranscriptSegment } from "@/lib/schema";
import { formatTimestamp } from "@/lib/transcript";
import { formatUsd } from "@/lib/cost";

export function CostLine({ durationSeconds, transcriptionUsd, llmUsd }: { durationSeconds: number; transcriptionUsd: number; llmUsd: number }) {
  const total = transcriptionUsd + llmUsd;
  return (
    <p className="text-xs text-muted">
      {formatTimestamp(durationSeconds)} of audio · cost {formatUsd(total)} (transcription {formatUsd(transcriptionUsd)}, notes {formatUsd(llmUsd)})
    </p>
  );
}

export function NotesView({ notes }: { notes: MeetingNotes }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="glass p-5 md:col-span-2">
        <span className="pill">Summary</span>
        <p className="mt-3 text-muted">{notes.summary}</p>
        {notes.key_points.length ? (
          <ul className="mt-4 list-disc space-y-1 pl-5 text-sm">
            {notes.key_points.map((k, i) => <li key={i}>{k}</li>)}
          </ul>
        ) : null}
      </div>

      <div className="glass p-5">
        <span className="pill">Action items · {notes.action_items.length}</span>
        <ul className="mt-3 space-y-3">
          {notes.action_items.map((a, i) => (
            <li key={i} className="rounded-xl border border-panel-border bg-black/20 p-3">
              <div className="flex items-start justify-between gap-2">
                <p className="font-medium">{a.title}</p>
                <span className={`pill ${a.priority === "high" ? "text-danger" : ""}`}>{a.priority}</span>
              </div>
              <p className="mt-1 text-sm text-muted">{a.details}</p>
              <p className="mt-2 text-xs text-muted">
                {a.kind} · {a.owner ?? "unassigned"}{a.due ? ` · due ${a.due}` : ""}
              </p>
            </li>
          ))}
          {notes.action_items.length === 0 ? <li className="text-sm text-muted">None found.</li> : null}
        </ul>
      </div>

      <div className="flex flex-col gap-4">
        <div className="glass p-5">
          <span className="pill">Decisions</span>
          <ul className="mt-3 space-y-2 text-sm">
            {notes.decisions.map((d, i) => (
              <li key={i}><span className="font-medium">{d.decision}</span> <span className="text-muted">— {d.context}</span></li>
            ))}
            {notes.decisions.length === 0 ? <li className="text-muted">None recorded.</li> : null}
          </ul>
        </div>
        <div className="glass p-5">
          <span className="pill">People to contact</span>
          <ul className="mt-3 space-y-2 text-sm">
            {notes.people_to_contact.map((p, i) => (
              <li key={i}><span className="font-medium">{p.name}</span>{p.role ? <span className="text-muted"> · {p.role}</span> : null}<div className="text-muted">{p.why}</div></li>
            ))}
            {notes.people_to_contact.length === 0 ? <li className="text-muted">Nobody flagged.</li> : null}
          </ul>
        </div>
        <div className="glass p-5">
          <span className="pill">Open questions</span>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm">
            {notes.open_questions.map((q, i) => <li key={i}>{q}</li>)}
            {notes.open_questions.length === 0 ? <li className="list-none text-muted">None.</li> : null}
          </ul>
        </div>
      </div>
    </div>
  );
}

export function TranscriptView({ segments }: { segments: TranscriptSegment[] }) {
  return (
    <details className="glass p-5">
      <summary className="cursor-pointer font-semibold">Transcript · {segments.length} segments</summary>
      <div className="mt-4 space-y-2 font-mono text-sm">
        {segments.map((s, i) => (
          <p key={i}>
            <span className="text-muted">[{formatTimestamp(s.start)}]</span> <span className="text-accent">{s.speaker}:</span> {s.text}
          </p>
        ))}
      </div>
    </details>
  );
}
