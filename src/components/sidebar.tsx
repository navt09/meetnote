"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "@/components/logo";

/**
 * The app's navigation, once you are signed in.
 *
 * A rail rather than a top bar: the tabs stopped fitting across the top once
 * there were six of them, and a vertical list has room for as many as the
 * product grows. Each entry carries the key that will jump to it, which is
 * both a hint that the keyboard works and a reason the labels stay short.
 */

const TABS = [
  { href: "/dashboard", label: "Home", key: "H", match: (p: string) => p.startsWith("/dashboard") },
  { href: "/notes", label: "Notes", key: "N", match: (p: string) => p === "/notes" || p.startsWith("/meetings") },
  { href: "/tasks", label: "Tasks", key: "T", match: (p: string) => p.startsWith("/tasks") },
  { href: "/approvals", label: "Approvals", key: "A", match: (p: string) => p.startsWith("/approvals") },
  { href: "/record", label: "Record", key: "R", match: (p: string) => p.startsWith("/record") },
  { href: "/settings", label: "Settings", key: ",", match: (p: string) => p.startsWith("/settings") },
];

const OWNER_TAB = { href: "/owner", label: "Owner", key: "O", match: (p: string) => p.startsWith("/owner") };

export default function Sidebar({ email, isOwner }: { email: string; isOwner: boolean }) {
  const pathname = usePathname() ?? "";
  const tabs = isOwner ? [...TABS, OWNER_TAB] : TABS;

  return (
    <aside className="flex shrink-0 flex-col gap-5 border-b border-panel-border bg-rail px-3 py-4 md:h-screen md:w-[13rem] md:border-b-0 md:border-r md:sticky md:top-0">
      <Link href="/dashboard" className="font-display flex items-center gap-2 whitespace-nowrap px-2 text-[1.0625rem] font-semibold tracking-tight">
        <Logo size={22} />
        From the Call
      </Link>

      <nav className="flex gap-0.5 overflow-x-auto md:flex-col md:overflow-visible no-scrollbar">
        {tabs.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            aria-current={t.match(pathname) ? "page" : undefined}
            className="rail-link whitespace-nowrap"
          >
            <span>{t.label}</span>
            <span className="rail-key hidden md:inline">{t.key}</span>
          </Link>
        ))}
      </nav>

      <form action="/auth/signout" method="post" className="mt-auto hidden flex-col gap-1 border-t border-panel-border px-2 pt-3 md:flex">
        <span className="truncate text-xs text-faint" title={email}>{email}</span>
        <button className="self-start text-xs text-muted transition-colors hover:text-fg" type="submit">Sign out</button>
      </form>
    </aside>
  );
}
