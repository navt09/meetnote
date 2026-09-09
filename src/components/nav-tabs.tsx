"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/dashboard", label: "Home", match: (p: string) => p.startsWith("/dashboard") },
  { href: "/notes", label: "Notes", match: (p: string) => p === "/notes" || p.startsWith("/meetings") },
  { href: "/tasks", label: "Tasks", match: (p: string) => p.startsWith("/tasks") },
  { href: "/record", label: "Record", match: (p: string) => p.startsWith("/record") },
];

export default function NavTabs() {
  const pathname = usePathname() ?? "";
  return (
    <div className="flex items-center gap-0.5 rounded-full border border-panel-border bg-black/25 p-1">
      {TABS.map((t) => {
        const active = t.match(pathname);
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={`relative rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
              active ? "text-fg" : "text-muted hover:text-fg"
            }`}
          >
            {active ? (
              <span
                aria-hidden
                className="absolute inset-0 rounded-full border border-accent/30 bg-gradient-to-r from-accent/20 to-accent-2/20"
              />
            ) : null}
            <span className="relative">{t.label}</span>
          </Link>
        );
      })}
    </div>
  );
}
