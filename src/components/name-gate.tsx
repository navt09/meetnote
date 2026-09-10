"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { putJson } from "@/lib/upload";
import { useToast } from "@/components/toast";

/**
 * Asked for before the first recording, and only once.
 *
 * The name is not decoration. It is what puts this person's own words under
 * their name in the transcript, what lets the notes catch somebody else saying
 * it, and what makes the Tasks page theirs rather than everybody's. Recording
 * without it produces notes that are quietly worse in ways nobody would think
 * to complain about, so it is asked for here rather than left as a setting
 * most people never open.
 *
 * Asked for in place, not by sending someone to Settings. They came here to
 * record, and a round trip through another page to type one word is exactly
 * the kind of thing that gets a product closed.
 */
export function NameGate() {
  const router = useRouter();
  const toast = useToast();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmed = name.trim();

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !trimmed) return;
    setBusy(true);
    setError(null);
    try {
      const res = await putJson<{ name: string | null }>("/api/settings/display-name", { name: trimmed });
      if (!res.name) {
        // The server strips anything that is not a name, so a box full of
        // punctuation comes back empty rather than saved.
        setError("That does not look like a name. Letters, please.");
        return;
      }
      toast(`Your notes will call you ${res.name}.`, "ok");
      // Re-render the page from the server, which is what reveals the recorder.
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save your name");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className="rounded-xl border border-panel-border bg-panel-hi p-5 sm:p-6">
      <p className="font-display text-base font-semibold">What should the notes call you?</p>
      <p className="mt-1.5 max-w-prose text-sm leading-relaxed text-muted">
        Your own voice is picked out from your microphone already. A name is what puts it on your lines in the
        transcript, lets the notes catch when somebody else says it, and makes the Tasks page show your work rather
        than everyone&apos;s.
      </p>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <label className="sr-only" htmlFor="your-name">
          Your first name
        </label>
        {/* 60 mirrors DISPLAY_NAME_MAX, which lives in a server-only module and
            cannot be imported here. The server clamps to it either way. */}
        <input
          id="your-name"
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your first name"
          maxLength={60}
          className="field text-base sm:max-w-xs"
        />
        <button type="submit" className="btn btn-primary" disabled={busy || !trimmed}>
          {busy ? "Saving…" : "Save and record"}
        </button>
      </div>

      {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}
      <p className="mt-3 text-xs text-faint">First name is plenty. You can change it later in Settings.</p>
    </form>
  );
}
