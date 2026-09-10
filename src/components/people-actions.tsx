"use client";

import Link from "next/link";
import { useState } from "react";
import { postJson } from "@/lib/upload";
import { useToast } from "@/components/toast";
import type { MeetingNotes } from "@/lib/schema";
import { canDraft, type Tier } from "@/lib/account";
import { isUpgradeError, upgradeMessage, UpgradeNote } from "@/components/upgrade";

/**
 * Kept in step with DRAFT_NOTE_MAX in src/lib/agent.ts by hand: importing it
 * would pull the server-only Anthropic client into the browser bundle. The
 * server trims to the same cap, so the two agreeing is a courtesy to the
 * typist, not the boundary.
 */
const NOTE_MAX = 500;

/**
 * The people a meeting said to contact, each with a button that drafts a
 * follow-up email. The draft goes to Approvals; nothing is ever sent from here.
 */
export function PeopleToContact({
  meetingId,
  people,
  tier,
}: {
  meetingId: string;
  people: MeetingNotes["people_to_contact"];
  tier: Tier;
}) {
  const toast = useToast();
  const mayDraft = canDraft(tier);
  const [drafting, setDrafting] = useState<string | null>(null);
  const [drafted, setDrafted] = useState<Set<string>>(new Set());
  const [noting, setNoting] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});

  async function draft(name: string) {
    setDrafting(name);
    try {
      await postJson(`/api/meetings/${meetingId}/draft-email`, { name, note: notes[name] ?? "" });
      setDrafted((s) => new Set(s).add(name));
      toast("Email drafted. Check it in Approvals.", "ok");
    } catch (err) {
      // The tier can change between this page loading and this click, so a
      // refusal is explained rather than shown as a raw failure.
      const fallbackMessage = err instanceof Error ? err.message : "Could not draft that email";
      toast(isUpgradeError(err) ? upgradeMessage("draft", fallbackMessage) : fallbackMessage, "error");
    } finally {
      setDrafting(null);
    }
  }

  return (
    <section id="people" className="band band-people scroll-mt-24">
      <div className="band-head">
        <h2 className="band-title">People to contact</h2>
        <span className="band-count">{people.length}</span>
      </div>
      <ul className="band-body">
        {people.map((p, i) => (
          <li key={i} className="band-row">
            <p className="font-medium leading-snug">
              {p.name}
              {p.role ? <span className="font-normal text-faint"> · {p.role}</span> : null}
            </p>
            <p className="mt-1 text-sm leading-relaxed text-muted">{p.why}</p>
            {drafted.has(p.name) ? (
              <p className="mt-2 text-xs">
                <Link href="/approvals" className="text-accent transition-colors hover:underline">email drafted</Link>
              </p>
            ) : !mayDraft ? (
              /* The note box goes with the button: it only exists to steer a
                 draft nobody on this tier can ask for. */
              <UpgradeNote reason="draft" className="mt-2" />
            ) : (
              <>
                {noting === p.name ? (
                  <textarea
                    value={notes[p.name] ?? ""}
                    onChange={(e) => setNotes((n) => ({ ...n, [p.name]: e.target.value }))}
                    maxLength={NOTE_MAX}
                    rows={3}
                    placeholder="Anything you want the email to cover? Optional."
                    className="field mt-2 w-full text-sm"
                  />
                ) : null}
                <p className="mt-2 flex items-center gap-3 text-xs">
                  <button
                    onClick={() => draft(p.name)}
                    disabled={drafting === p.name}
                    className="text-faint transition-colors hover:text-fg disabled:opacity-50"
                  >
                    {drafting === p.name ? "drafting…" : "draft email"}
                  </button>
                  {noting === p.name ? null : (
                    <button onClick={() => setNoting(p.name)} className="text-accent transition-colors hover:underline">
                      add a note
                    </button>
                  )}
                </p>
              </>
            )}
          </li>
        ))}
        {people.length === 0 ? <li className="band-row text-sm text-muted">Nobody was flagged.</li> : null}
      </ul>
    </section>
  );
}
