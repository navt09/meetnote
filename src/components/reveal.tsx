"use client";

import { useEffect, useRef } from "react";

/**
 * Fades its children up as they scroll into view, once.
 *
 * The rule that matters: the page is complete at rest. Nothing is hidden by
 * default. On mount, anything already on screen is left exactly as it is;
 * only what is still below the fold gets the `.reveal` class, and it loses it
 * the moment it enters. No JavaScript, no reduced-motion setting, or a
 * thumbnail capture all see the finished page.
 *
 * The class is toggled on the DOM node directly. There is no React state here
 * because nothing else needs to know.
 */
export function Reveal({
  children,
  className = "",
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  /** Milliseconds, for a row of siblings that should arrive in order. */
  delay?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (el.getBoundingClientRect().top < window.innerHeight * 0.92) return;

    el.classList.add("reveal");
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        el.classList.add("is-in");
        io.disconnect();
      },
      { rootMargin: "0px 0px -8% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={ref} className={className} style={delay ? { transitionDelay: `${delay}ms` } : undefined}>
      {children}
    </div>
  );
}
