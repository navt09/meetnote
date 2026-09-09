import { useSyncExternalStore } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

function subscribe(onChange: () => void) {
  const media = window.matchMedia(QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

/**
 * True when the visitor has asked for less motion. The stylesheet already
 * collapses CSS animation under that setting; this is for the JavaScript side,
 * so a timed sequence can render its final frame instead of running.
 *
 * useSyncExternalStore rather than an effect and state, so the server and the
 * first client render agree (false) and nothing flashes.
 */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => false,
  );
}
