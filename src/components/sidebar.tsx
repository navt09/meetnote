"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { Logo } from "@/components/logo";

/**
 * The app's navigation, once you are signed in.
 *
 * Ink against the paper the work sits on, which is the same alternation the
 * landing page runs down the screen, and it keeps the chrome out of the way of
 * the three hues that carry meaning inside the content.
 *
 * A single marker slides between the tabs rather than each one carrying its
 * own background. It is positioned by measuring the live DOM and writing to
 * the node, not through React state: nothing else in the tree needs to know
 * where it is, and a mid-flight render would fight the transition.
 */

const TABS = [
  { href: "/dashboard", label: "Home", match: (p: string) => p.startsWith("/dashboard") },
  { href: "/notes", label: "Notes", match: (p: string) => p === "/notes" || p.startsWith("/meetings") },
  { href: "/tasks", label: "Tasks", match: (p: string) => p.startsWith("/tasks") },
  { href: "/approvals", label: "Approvals", match: (p: string) => p.startsWith("/approvals") },
  { href: "/record", label: "Record", match: (p: string) => p.startsWith("/record") },
  { href: "/settings", label: "Settings", match: (p: string) => p.startsWith("/settings") },
];

const OWNER_TAB = { href: "/owner", label: "Owner", match: (p: string) => p.startsWith("/owner") };

export default function Sidebar({ email, isOwner }: { email: string; isOwner: boolean }) {
  const pathname = usePathname() ?? "";
  const tabs = isOwner ? [...TABS, OWNER_TAB] : TABS;

  const navRef = useRef<HTMLElement>(null);
  const pillRef = useRef<HTMLSpanElement>(null);
  const settled = useRef(false);

  useEffect(() => {
    const nav = navRef.current;
    const pill = pillRef.current;
    if (!nav || !pill) return;

    const place = () => {
      const active = nav.querySelector<HTMLElement>('[aria-current="page"]');
      if (!active) {
        pill.style.opacity = "0";
        return;
      }
      // The first placement must not slide in from the corner.
      if (!settled.current) {
        settled.current = true;
        pill.style.transition = "none";
        requestAnimationFrame(() => {
          pill.style.transition = "";
        });
      }
      pill.style.opacity = "1";
      pill.style.width = `${active.offsetWidth}px`;
      pill.style.height = `${active.offsetHeight}px`;
      pill.style.transform = `translate(${active.offsetLeft}px, ${active.offsetTop}px)`;
    };

    place();
    // The rail turns from a column into a scrolling row at the mobile
    // breakpoint, so the marker has to be re-measured on resize.
    const observer = new ResizeObserver(place);
    observer.observe(nav);
    return () => observer.disconnect();
  }, [pathname, tabs.length]);

  return (
    <aside className="rail flex shrink-0 flex-col gap-6 px-3 py-4 md:sticky md:top-0 md:h-screen md:w-[13.5rem]">
      <Link
        href="/dashboard"
        className="font-display flex items-center gap-2.5 whitespace-nowrap px-2 text-[1.0625rem] font-semibold tracking-tight"
      >
        <Logo size={22} />
        From the Call
      </Link>

      <nav
        ref={navRef}
        className="rail-nav no-scrollbar flex gap-1 overflow-x-auto md:flex-col md:gap-0.5 md:overflow-visible"
      >
        <span ref={pillRef} aria-hidden className="rail-pill" />
        {tabs.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            aria-current={t.match(pathname) ? "page" : undefined}
            className="rail-link whitespace-nowrap"
          >
            {t.label}
          </Link>
        ))}
      </nav>

      <form action="/auth/signout" method="post" className="rail-foot mt-auto hidden flex-col gap-1 px-2 pt-3.5 md:flex">
        <span className="rail-quiet truncate text-xs" title={email}>{email}</span>
        <button className="rail-quiet rail-action self-start text-xs" type="submit">Sign out</button>
      </form>
    </aside>
  );
}
