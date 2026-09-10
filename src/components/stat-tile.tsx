import type { Delta } from "@/lib/stats";

/**
 * label · value · optional delta against a named period.
 * Proportional figures at display size; tabular is for columns.
 */
/**
 * Up is green and down is red, on every tile.
 *
 * There used to be a `goodDirection` prop deciding which way counted as an
 * improvement, which meant two tiles could show the same "+1" in different
 * colours. Nobody reads a dashboard that carefully. The direction of the
 * number is what the colour says, and the sign in the text says it too, so
 * the colour is reinforcement rather than the only signal.
 */
export function StatTile({
  label,
  value,
  delta,
  deltaText,
}: {
  label: string;
  value: string;
  delta?: Delta;
  deltaText?: string;
}) {
  const tone =
    !delta || delta.direction === "flat" ? "text-faint" : delta.direction === "up" ? "text-ok" : "text-danger";

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
