"use client";

import Link from "next/link";
import { useState } from "react";
import { postJson } from "@/lib/upload";
import { useToast } from "@/components/toast";
import type { MeetingNotes } from "@/lib/schema";

/**
 * The people a meeting said to contact, each with a button that drafts a
 * follow-up email. The draft goes to Approvals; nothing is ever sent from here.
 */
export function PeopleToContact({ meetingId, people }: { meetingId: string; people: MeetingNotes["people_to_contact"] }) {
  const toast = useToast();
  const [drafting, setDrafting] = useState<string | null>(null);
  const [drafted, setDrafted] = useState<Set<string>>(new Set());

  async function draft(name: string) {
    setDrafting(name);
    try {
      await postJson(`/api/meetings/${meetingId}/draft-email`, { name });
      setDrafted((s) => new Set(s).add(name));
      toast("Email drafted. Check it in Approvals.", "ok");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not draft that email", "error");
    } finally {
      setDrafting(null);
    }
  }

  return (
    <div className="glass p-6">
      {/* Matches SectionHead in notes.tsx; this card sits beside those. */}
      <div className="flex items-baseline justify-between gap-3 border-b border-panel-border pb-3">
        <h2 className="font-display text-base font-semibold tracking-tight">People to contact</h2>
        <span className="font-mono text-xs text-faint">{people.length}</span>
      </div>
      <ul className="mt-4 flex flex-col gap-3.5 text-sm">
        {people.map((p, i) => (
          <li key={i} className="border-l-2 border-accent/50 pl-3.5">
            <p className="font-medium leading-snug">
              {p.name}
              {p.role ? <span className="font-normal text-faint"> · {p.role}</span> : null}
            </p>
            <p className="mt-1 leading-relaxed text-muted">{p.why}</p>
            <p className="mt-2 text-xs">
              {drafted.has(p.name) ? (
                <Link href="/approvals" className="text-accent transition-colors hover:underline">email drafted</Link>
              ) : (
                <button
                  onClick={() => draft(p.name)}
                  disabled={drafting === p.name}
                  className="text-faint transition-colors hover:text-fg disabled:opacity-50"
                >
                  {drafting === p.name ? "drafting…" : "draft email"}
                </button>
              )}
            </p>
          </li>
        ))}
        {people.length === 0 ? <li className="text-muted">Nobody flagged.</li> : null}
      </ul>
    </div>
  );
}
