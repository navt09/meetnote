import type { Provider } from "@/lib/connectors";

/**
 * Connector logos, each in the provider's own real colours.
 *
 * These were monochrome until now, one brand hue per provider, on the argument
 * that four-colour marks next to flat ones read as clip art. What that missed
 * is what the row is for: somebody scanning Settings is looking for a logo they
 * already know, and four of the five landed in the same blue-purple band once
 * they were flattened, which is the one thing a logo is supposed to prevent.
 * Recognition beats tidiness here.
 *
 * So a mark is a list of pieces rather than one path. Linear and Jira list a
 * single piece and take the brand hue from `hex`; they are not exceptions, they
 * are simply one-colour logos. Jira's real mark carries a gradient, and this is
 * Atlassian's own flat rendering of it.
 *
 * `hex` now does one job only: it tints the chip behind the mark. Keeping one
 * tint per provider is what stops five full-colour logos from turning the list
 * into a fruit bowl, and at 12% over the panel it stays a ground rather than a
 * colour of its own.
 *
 * Paths for Linear, Jira and Google come from simple-icons and Google's own
 * sign-in assets. Slack was withdrawn from that library, so its pinwheel is
 * written out here; it is pure geometry, eight rounded capsules in four pairs.
 * Microsoft's is four rectangles, which is quicker to read than a dependency.
 */

type Piece = { d: string; fill?: string };
type Mark = { label: string; hex: string; pieces: Piece[] };

const MARKS: Record<Provider, Mark> = {
  linear: {
    label: "Linear",
    hex: "#5E6AD2",
    pieces: [
      {
        d: "M2.886 4.18A11.982 11.982 0 0 1 11.99 0C18.624 0 24 5.376 24 12.009c0 3.64-1.62 6.903-4.18 9.105L2.887 4.18ZM1.817 5.626l16.556 16.556c-.524.33-1.075.62-1.65.866L.951 7.277c.247-.575.537-1.126.866-1.65ZM.322 9.163l14.515 14.515c-.71.172-1.443.282-2.195.322L0 11.358a12 12 0 0 1 .322-2.195Zm-.17 4.862 9.823 9.824a12.02 12.02 0 0 1-9.824-9.824Z",
      },
    ],
  },

  jira: {
    label: "Jira",
    hex: "#0052CC",
    pieces: [
      {
        d: "M11.571 11.513H0a5.218 5.218 0 0 0 5.232 5.215h2.13v2.057A5.215 5.215 0 0 0 12.575 24V12.518a1.005 1.005 0 0 0-1.005-1.005zm5.723-5.756H5.736a5.215 5.215 0 0 0 5.215 5.214h2.129v2.058a5.218 5.218 0 0 0 5.215 5.214V6.758a1.001 1.001 0 0 0-1.001-1.001zM23.013 0H11.455a5.215 5.215 0 0 0 5.215 5.215h2.129v2.057A5.215 5.215 0 0 0 24 12.483V1.005A1.001 1.001 0 0 0 23.013 0Z",
      },
    ],
  },

  /**
   * The pinwheel is four arms, each a long capsule plus the small nub that
   * turns the corner, so the colours go in pairs rather than one per subpath.
   * The chip keeps a lifted aubergine: Slack's own #4A154B is so dark that a
   * 12% tint of it disappears into the panel entirely.
   */
  slack: {
    label: "Slack",
    hex: "#7C3085",
    pieces: [
      {
        fill: "#E01E5A",
        d: "M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313z",
      },
      {
        fill: "#36C5F0",
        d: "M8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312z",
      },
      {
        fill: "#2EB67D",
        d: "M18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.685 8.834a2.528 2.528 0 0 1-2.522 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.163 0a2.528 2.528 0 0 1 2.522 2.522v6.312z",
      },
      {
        fill: "#ECB22E",
        d: "M15.163 18.956a2.528 2.528 0 0 1 2.522 2.522A2.528 2.528 0 0 1 15.163 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.163 17.685a2.527 2.527 0 0 1-2.52-2.52 2.526 2.526 0 0 1 2.52-2.521h6.315A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.52h-6.315z",
      },
    ],
  },

  /** The G, in the four colours Google draws it in. Blue tints the chip. */
  google: {
    label: "Google",
    hex: "#4285F4",
    pieces: [
      {
        fill: "#4285F4",
        d: "M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z",
      },
      {
        fill: "#34A853",
        d: "M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z",
      },
      {
        fill: "#FBBC05",
        d: "M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z",
      },
      {
        fill: "#EA4335",
        d: "M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z",
      },
    ],
  },

  /**
   * Four squares, and the colours are the whole logo: Office orange, Xbox
   * green, Windows blue, then yellow, clockwise from the top left. The blue
   * tints the chip because it is the one Microsoft itself uses for links.
   */
  microsoft: {
    label: "Microsoft",
    hex: "#00A4EF",
    pieces: [
      { fill: "#F25022", d: "M0 0h11.377v11.372H0z" },
      { fill: "#7FBA00", d: "M12.623 0H24v11.372H12.623z" },
      { fill: "#00A4EF", d: "M0 12.623h11.377V24H0z" },
      { fill: "#FFB900", d: "M12.623 12.623H24V24H12.623z" },
    ],
  },
};

/** The provider's logo on a tinted chip, sized to sit in a settings row. */
export function BrandMark({ provider }: { provider: Provider }) {
  const mark = MARKS[provider];
  return (
    <span
      className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border"
      // Brand hues are not design tokens, so they are set inline rather than
      // polluting globals.css with five colours used in one place.
      style={{ background: `${mark.hex}1f`, borderColor: `${mark.hex}3d` }}
    >
      <svg viewBox="0 0 24 24" width="24" height="24" role="img" aria-label={mark.label}>
        {/* Fixed lists that are never reordered, so the index is a stable key. */}
        {mark.pieces.map((piece, i) => (
          <path key={i} d={piece.d} fill={piece.fill ?? mark.hex} />
        ))}
      </svg>
    </span>
  );
}
