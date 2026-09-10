import { isInProgress, statusLabel, statusProgress, type MeetingStatus } from "@/lib/meeting";

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`skeleton ${className}`} />;
}

export function MeetingListSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <ul className="flex flex-col gap-2" aria-hidden>
      {Array.from({ length: rows }).map((_, i) => (
        <li key={i} className="glass flex items-center justify-between gap-3 p-4">
          <span className="flex-1">
            <Skeleton className="h-4 w-2/5" />
            <Skeleton className="mt-2 h-3 w-1/4" />
          </span>
          <Skeleton className="h-5 w-16" />
        </li>
      ))}
    </ul>
  );
}

export function NotesSkeleton() {
  return (
    <div className="grid gap-3 md:grid-cols-2" aria-hidden>
      <div className="glass p-5 md:col-span-2">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="mt-4 h-4 w-full" />
        <Skeleton className="mt-2 h-4 w-11/12" />
        <Skeleton className="mt-2 h-4 w-3/4" />
      </div>
      <div className="glass p-5">
        <Skeleton className="h-3 w-24" />
        {[0, 1, 2].map((i) => (
          <div key={i} className="mt-3 rounded-lg border border-panel-border p-3">
            <Skeleton className="h-4 w-3/5" />
            <Skeleton className="mt-2 h-3 w-full" />
          </div>
        ))}
      </div>
      <div className="glass p-5">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="mt-4 h-3 w-full" />
        <Skeleton className="mt-2 h-3 w-4/5" />
      </div>
    </div>
  );
}

export function StatusPill({ status }: { status: MeetingStatus }) {
  const cls = status === "error" ? "pill-danger" : status === "done" ? "pill-ok" : isInProgress(status) ? "pill-live" : "";
  return (
    <span className={`pill ${cls}`}>
      {isInProgress(status) ? <span className="rec-dot rec-dot-accent" /> : null}
      {statusLabel(status)}
    </span>
  );
}

const STEPS = [
  { key: "upload", label: "Audio" },
  { key: "transcribe", label: "Transcript" },
  { key: "extract", label: "Notes" },
] as const;

/** Which stage of processing a meeting is at; the active leg animates. */
export function ProcessingStepper({ status }: { status: MeetingStatus }) {
  const stage = status === "uploaded" ? 0 : status === "transcribing" || status === "transcribed" ? 1 : status === "extracting" ? 2 : 3;
  const done = (i: number) => (status === "done" ? true : i < stage);
  const active = (i: number) => status !== "done" && status !== "error" && i === stage;

  return (
    <div>
      <div className="flex items-center gap-2">
        {STEPS.map((s, i) => (
          <div key={s.key} className="flex flex-1 items-center gap-2 last:flex-none">
            <span className={`step-dot ${done(i) ? "step-dot-done" : active(i) ? "step-dot-active" : ""}`}>{done(i) ? "✓" : i + 1}</span>
            <span className={`text-xs ${done(i) || active(i) ? "text-fg" : "text-faint"}`}>{s.label}</span>
            {i < STEPS.length - 1 ? <span className={`step-line ${done(i) ? "step-line-done" : active(i) ? "step-line-active" : ""}`} /> : null}
          </div>
        ))}
      </div>
      <div className="bar-track mt-4">
        <div className="bar-fill" style={{ width: `${Math.round(statusProgress(status) * 100)}%` }} />
      </div>
    </div>
  );
}

/**
 * The header every page in the app opens with.
 *
 * The same skeleton as a section on the landing page: the title on the left,
 * the one thing to do on the right, a hairline under both. The title is set in
 * Fraunces at regular weight rather than the body face, which is what makes
 * the tool and the shopfront read as one product without sharing a palette.
 */
/**
 * What a meeting produced, in one line: work, what was agreed, who to contact.
 * The same three hues the notes page uses, so the list and the page agree
 * without the list having to spell the words out.
 */
export function Tally({ tasks, decisions, people }: { tasks: number; decisions: number; people: number }) {
  const parts = [
    { n: tasks, label: tasks === 1 ? "task" : "tasks", hue: "var(--work)" },
    { n: decisions, label: decisions === 1 ? "decision" : "decisions", hue: "var(--agreed)" },
    { n: people, label: people === 1 ? "to contact" : "to contact", hue: "var(--people)" },
  ].filter((x) => x.n > 0);

  if (parts.length === 0) return null;
  return (
    <span className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
      {parts.map((x) => (
        <span key={x.label} className="flex items-center gap-1.5" style={{ color: x.hue }}>
          <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ background: x.hue }} />
          <span className="figure">{x.n}</span>
          <span className="text-muted">{x.label}</span>
        </span>
      ))}
    </span>
  );
}

export function PageHead({
  title,
  meta,
  action,
}: {
  title: React.ReactNode;
  meta?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <header className="sec-head bleed rise">
      <div className="min-w-0">
        <h1 className="display text-4xl">{title}</h1>
        {meta ? <p className="mt-2 text-sm text-muted">{meta}</p> : null}
      </div>
      {action ? <div className="flex shrink-0 flex-wrap gap-2">{action}</div> : null}
    </header>
  );
}

export function EmptyState({ title, body, action }: { title: string; body: string; action?: React.ReactNode }) {
  return (
    <div className="glass px-6 py-12 text-center">
      <p className="font-medium">{title}</p>
      <p className="mx-auto mt-1.5 max-w-sm text-sm leading-relaxed text-muted">{body}</p>
      {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
    </div>
  );
}
