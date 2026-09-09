/**
 * The From the Call mark: three rounded bars reading as a level meter, which is
 * what the product is about before anything else, and which still reads at
 * favicon size where a letter or a wordmark would not.
 *
 * Kept as inline SVG rather than a file in /public so it inherits the accent
 * token and never flashes in late on a slow connection.
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
      <rect width="24" height="24" rx="6.5" fill="var(--accent)" />
      <g fill="var(--accent-ink)">
        <rect x="6" y="9.25" width="2.6" height="5.5" rx="1.3" />
        <rect x="10.7" y="5.75" width="2.6" height="12.5" rx="1.3" />
        <rect x="15.4" y="8" width="2.6" height="8" rx="1.3" />
      </g>
    </svg>
  );
}
