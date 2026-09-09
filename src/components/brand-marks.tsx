import type { Provider } from "@/lib/connectors";

/**
 * Connector logos.
 *
 * Each is the provider's real mark as a single monochrome path, drawn in that
 * provider's own brand colour on a tint of the same hue. Monochrome rather than
 * full colour is deliberate: mixing Google's four-colour G and Slack's pinwheel
 * with flat marks for Linear and Jira reads as a pile of clip art, and the rest
 * of the product is flat and one-accent by design.
 *
 * Paths for Linear, Jira and Google come from simple-icons. Slack was withdrawn
 * from that library, so its pinwheel is written out here; it is pure geometry,
 * eight rounded capsules around a square.
 */

type Mark = { path: string; hex: string; label: string };

const MARKS: Record<Provider, Mark> = {
  linear: {
    hex: "#5E6AD2",
    label: "Linear",
    path: "M2.886 4.18A11.982 11.982 0 0 1 11.99 0C18.624 0 24 5.376 24 12.009c0 3.64-1.62 6.903-4.18 9.105L2.887 4.18ZM1.817 5.626l16.556 16.556c-.524.33-1.075.62-1.65.866L.951 7.277c.247-.575.537-1.126.866-1.65ZM.322 9.163l14.515 14.515c-.71.172-1.443.282-2.195.322L0 11.358a12 12 0 0 1 .322-2.195Zm-.17 4.862 9.823 9.824a12.02 12.02 0 0 1-9.824-9.824Z",
  },
  jira: {
    hex: "#0052CC",
    label: "Jira",
    path: "M11.571 11.513H0a5.218 5.218 0 0 0 5.232 5.215h2.13v2.057A5.215 5.215 0 0 0 12.575 24V12.518a1.005 1.005 0 0 0-1.005-1.005zm5.723-5.756H5.736a5.215 5.215 0 0 0 5.215 5.214h2.129v2.058a5.218 5.218 0 0 0 5.215 5.214V6.758a1.001 1.001 0 0 0-1.001-1.001zM23.013 0H11.455a5.215 5.215 0 0 0 5.215 5.215h2.129v2.057A5.215 5.215 0 0 0 24 12.483V1.005A1.001 1.001 0 0 0 23.013 0Z",
  },
  slack: {
    hex: "#7C3085",
    label: "Slack",
    path: "M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.685 8.834a2.528 2.528 0 0 1-2.522 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.163 0a2.528 2.528 0 0 1 2.522 2.522v6.312zM15.163 18.956a2.528 2.528 0 0 1 2.522 2.522A2.528 2.528 0 0 1 15.163 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.163 17.685a2.527 2.527 0 0 1-2.52-2.52 2.526 2.526 0 0 1 2.52-2.521h6.315A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.52h-6.315z",
  },
  google: {
    hex: "#4285F4",
    label: "Google",
    path: "M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z",
  },
};

/** The provider's logo on a tinted chip, sized to sit in a settings row. */
export function BrandMark({ provider }: { provider: Provider }) {
  const mark = MARKS[provider];
  return (
    <span
      className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border"
      // Brand hues are not design tokens, so they are set inline rather than
      // polluting globals.css with four colours used in one place.
      style={{ background: `${mark.hex}1f`, borderColor: `${mark.hex}3d` }}
    >
      <svg viewBox="0 0 24 24" width="17" height="17" role="img" aria-label={mark.label} fill={mark.hex}>
        <path d={mark.path} />
      </svg>
    </span>
  );
}
