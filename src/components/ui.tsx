import { isInProgress, statusLabel, statusProgress, type MeetingStatus } from "@/lib/meeting";

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`skeleton ${className}`} />;
}

export function MeetingListSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <ul className="flex flex-col gap-3" aria-hidden>
      {Array.from({ length: rows }).map((_, i) => (
        <li key={i} className="glass flex items-center justify-between gap-3 p-4">
          <span className="flex-1">
            <Skeleton className="h-4 w-2/5" />
            <Skeleton className="mt-2 h-3 w-1/4" />
          </span>
          <Skeleton className="h-6 w-20 rounded-full" />
        </li>
      ))}
    </ul>
  );
}

export function NotesSkeleton() {
  return (
    <div className="grid gap-4 md:grid-cols-2" aria-hidden>
      <div className="glass p-5 md:col-span-2">
        <Skeleton className="h-3 w-24 rounded-full" />
        <Skeleton className="mt-4 h-4 w-full" />
        <Skeleton className="mt-2 h-4 w-11/12" />
        <Skeleton className="mt-2 h-4 w-3/4" />
      </div>
      <div className="glass p-5">
        <Skeleton className="h-3 w-28 rounded-full" />
        {[0, 1, 2].map((i) => (
          <div key={i} className="mt-3 rounded-xl border border-panel-border bg-black/20 p-3">
            <Skeleton className="h-4 w-3/5" />
            <Skeleton className="mt-2 h-3 w-full" />
          </div>
        ))}
      </div>
      <div className="glass p-5">
        <Skeleton className="h-3 w-20 rounded-full" />
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
      {isInProgress(status) ? <span className="rec-dot rec-dot-accent !h-1.5 !w-1.5" /> : null}
      {statusLabel(status)}
    </span>
  );
}

const STEPS = [
  { key: "upload", label: "Audio" },
  { key: "transcribe", label: "Transcript" },
  { key: "extract", label: "Notes" },
] as const;

/** Shows which stage of processing a meeting is at, with the active leg animating. */
export function ProcessingStepper({ status }: { status: MeetingStatus }) {
  const stage = status === "uploaded" ? 0 : status === "transcribing" ? 1 : status === "transcribed" ? 1 : status === "extracting" ? 2 : 3;
  const done = (i: number) => (status === "done" ? true : i < stage);
  const active = (i: number) => status !== "done" && status !== "error" && i === stage;

  return (
    <div>
      <div className="flex items-center gap-2">
        {STEPS.map((s, i) => (
          <div key={s.key} className="flex flex-1 items-center gap-2 last:flex-none">
            <span className={`step-dot ${done(i) ? "step-dot-done" : active(i) ? "step-dot-active" : ""}`}>
              {done(i) ? "✓" : i + 1}
            </span>
            <span className={`text-xs ${done(i) || active(i) ? "text-fg" : "text-muted"}`}>{s.label}</span>
            {i < STEPS.length - 1 ? (
              <span className={`step-line ${done(i) ? "step-line-done" : active(i) ? "step-line-active" : ""}`} />
            ) : null}
          </div>
        ))}
      </div>
      <div className="bar-track mt-4">
        <div className="bar-fill" style={{ width: `${Math.round(statusProgress(status) * 100)}%` }} />
      </div>
    </div>
  );
}

export function EmptyState({ title, body, action }: { title: string; body: string; action?: React.ReactNode }) {
  return (
    <div className="glass glass-lit pop p-10 text-center">
      <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-accent/20 to-accent-2/20 text-2xl">
        ✧
      </div>
      <p className="text-lg font-semibold">{title}</p>
      <p className="mx-auto mt-1 max-w-sm text-sm text-muted">{body}</p>
      {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
    </div>
  );
}
