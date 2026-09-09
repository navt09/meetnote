"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/dashboard", label: "Home", match: (p: string) => p.startsWith("/dashboard") },
  { href: "/notes", label: "Notes", match: (p: string) => p === "/notes" || p.startsWith("/meetings") },
  { href: "/tasks", label: "Tasks", match: (p: string) => p.startsWith("/tasks") },
  { href: "/approvals", label: "Approvals", match: (p: string) => p.startsWith("/approvals") },
  { href: "/record", label: "Record", match: (p: string) => p.startsWith("/record") },
  { href: "/settings", label: "Settings", match: (p: string) => p.startsWith("/settings") },
];

const OWNER_TAB = { href: "/owner", label: "Owner", match: (p: string) => p.startsWith("/owner") };

export default function NavTabs({ isOwner = false }: { isOwner?: boolean }) {
  const pathname = usePathname() ?? "";
  const tabs = isOwner ? [...TABS, OWNER_TAB] : TABS;
  return (
    <div className="flex items-center gap-0.5">
      {tabs.map((t) => {
        const active = t.match(pathname);
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={`whitespace-nowrap rounded-md px-2.5 py-1.5 text-sm transition-colors ${
              active ? "bg-panel-hi font-medium text-fg" : "text-muted hover:text-fg"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
