import type { Delta } from "@/lib/stats";

/**
 * label · value · optional delta against a named period.
 * The value uses proportional figures; tabular is for columns, not display sizes.
 */
export function StatTile({
  label,
  value,
  delta,
  deltaText,
  goodDirection = "up",
}: {
  label: string;
  value: string;
  delta?: Delta;
  deltaText?: string;
  goodDirection?: "up" | "down" | "none";
}) {
  const tone =
    !delta || delta.direction === "flat" || goodDirection === "none"
      ? "text-muted"
      : delta.direction === goodDirection
        ? "text-ok"
        : "text-warn";

  return (
    <div className="glass glass-hover p-5">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1.5 text-3xl font-semibold leading-none">{value}</p>
      {deltaText ? (
        <p className={`mt-2 flex items-center gap-1 text-xs ${tone}`}>
          {delta && delta.direction !== "flat" ? <span aria-hidden>{delta.direction === "up" ? "↑" : "↓"}</span> : null}
          {deltaText}
        </p>
      ) : null}
    </div>
  );
}

/** The single number the dashboard leads with. Exactly one per view. */
export function HeroFigure({ value, label, sub }: { value: string; label: string; sub?: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-widest text-muted">{label}</p>
      <p className="mt-1 text-6xl font-semibold leading-none tracking-tight">
        <span className="grad-text">{value}</span>
      </p>
      {sub ? <p className="mt-2 text-sm text-muted">{sub}</p> : null}
    </div>
  );
}
