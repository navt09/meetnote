"use client";

import { useRef } from "react";
import { useReducedMotion } from "@/lib/use-reduced-motion";

/**
 * Tilts its child toward the cursor, a few degrees at most, and eases back to
 * flat when the pointer leaves.
 *
 * The transform is written straight to the DOM node rather than through state:
 * a mousemove fires dozens of times a second and none of them are worth a
 * React render. Touch screens never fire mousemove, so on a phone this is just
 * a div.
 */
export function Tilt({
  children,
  max = 7,
  className = "",
}: {
  children: React.ReactNode;
  /** Maximum rotation in degrees on either axis. */
  max?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();

  function move(e: React.MouseEvent<HTMLDivElement>) {
    const el = ref.current;
    if (!el || reduce) return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    el.style.transform = `perspective(900px) rotateX(${(-y * max).toFixed(2)}deg) rotateY(${(x * max).toFixed(2)}deg)`;
  }

  function leave() {
    if (ref.current) ref.current.style.transform = "";
  }

  return (
    <div ref={ref} onMouseMove={move} onMouseLeave={leave} className={`tilt ${className}`}>
      {children}
    </div>
  );
}
