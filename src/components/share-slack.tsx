"use client";

import { useState } from "react";
import { postJson } from "@/lib/upload";
import { useToast } from "@/components/toast";

/**
 * Post these notes to the connected Slack channel.
 *
 * No approval step, unlike a drafted ticket or email. Those are text a model
 * wrote that someone else will read as though the user wrote it, which is
 * exactly what an approval queue is for. This sends the notes the person is
 * looking at, unchanged, to a channel they chose. Making them approve what
 * they are already reading would be ceremony.
 *
 * Hidden until it works: pressing it when Slack is not connected says so once
 * and then stays quiet, rather than the page having to know about connectors.
 */
export function ShareToSlack({ meetingId }: { meetingId: string }) {
  const toast = useToast();
  const [state, setState] = useState<"idle" | "sending" | "sent" | "unavailable">("idle");

  if (state === "unavailable") return null;

  async function share() {
    setState("sending");
    try {
      await postJson(`/api/meetings/${meetingId}/share/slack`, {});
      setState("sent");
      toast("Posted to Slack.", "ok");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not post to Slack";
      toast(message, "error");
      // "Connect Slack in Settings first" is not worth a button that stays on
      // the page nagging about it.
      setState(/connect slack/i.test(message) ? "unavailable" : "idle");
    }
  }

  return (
    <div className="mt-4 flex items-center gap-3 border-t border-panel-border pt-4">
      {state === "sent" ? (
        <span className="text-xs text-ok">Posted to Slack</span>
      ) : (
        <button
          onClick={share}
          disabled={state === "sending"}
          className="btn btn-ghost !py-1.5 text-xs disabled:opacity-50"
        >
          {state === "sending" ? "Posting…" : "Post to Slack"}
        </button>
      )}
      <span className="text-xs text-faint">Sends these notes to your channel.</span>
    </div>
  );
}
