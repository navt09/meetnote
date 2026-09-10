import type { Delta } from "@/lib/stats";

/**
 * label · value · optional delta against a named period.
 * Proportional figures at display size; tabular is for columns.
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
      ? "text-faint"
      : delta.direction === goodDirection
        ? "text-ok"
        : "text-warn";

  return (
    <div>
      <p className="text-xs text-muted">{label}</p>
      <p className="figure mt-2.5 text-3xl">{value}</p>
      {deltaText ? <p className={`mt-2 text-xs ${tone}`}>{deltaText}</p> : null}
    </div>
  );
}

/** The single number the page leads with. Exactly one per view. */
export function HeroFigure({ value, label, sub }: { value: string; label: string; sub?: string }) {
  return (
    <div>
      <p className="text-xs text-muted">{label}</p>
      <p className="figure mt-2.5 text-6xl">{value}</p>
      {sub ? <p className="mt-2.5 text-sm text-muted">{sub}</p> : null}
    </div>
  );
}
