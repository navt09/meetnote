/**
 * The From the Call mark: three rounded bars reading as a level meter, which is
 * what the product is about before anything else, and which still reads at
 * favicon size where a letter or a wordmark would not.
 *
 * Kept as inline SVG rather than a file in /public so it takes its colour from
 * the surface it lands on and never flashes in late on a slow connection.
 *
 * It reads --brand, not --accent. The accent is the work hue and changes with
 * the surface: blue on the shopfront, coral in the app. A logo that changed
 * colour when you signed in would read as a different product, so the mark
 * gets its own token and stays the blue the favicon already ships.
 */
export function Logo({ size = 22 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      role="img"
      aria-label="From the Call"
      className="shrink-0"
    >
      <rect width="24" height="24" rx="6.5" fill="var(--brand)" />
      <g fill="var(--brand-ink)">
        <rect x="6" y="9.25" width="2.6" height="5.5" rx="1.3" />
        <rect x="10.7" y="5.75" width="2.6" height="12.5" rx="1.3" />
        <rect x="15.4" y="8" width="2.6" height="8" rx="1.3" />
      </g>
    </svg>
  );
}
