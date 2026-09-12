"use client";

import { useState } from "react";
import { postJson } from "@/lib/upload";
import { useToast } from "@/components/toast";
import { canConnect, type Tier } from "@/lib/account";
import { isUpgradeError, UpgradeNote } from "@/components/upgrade";

/**
 * Save this meeting's notes into the chosen SharePoint site.
 *
 * A share, not a draft, like posting to Slack and appending to Excel: these are
 * the meeting's own words, already on the page in front of whoever presses it.
 * Approval exists for text a model wrote that somebody else will read as the
 * user's, and there is none of that here.
 *
 * Saving again makes a second copy rather than overwriting, because notes in a
 * shared library get edited by hand and a silent overwrite would lose that.
 * The button says so once it has saved.
 *
 * Hidden the moment it turns out there is nowhere to save to: a page about a
 * meeting should not carry a standing complaint about Settings.
 */
export function SaveToSharePoint({ meetingId, tier }: { meetingId: string; tier: Tier }) {
  const toast = useToast();
  const [state, setState] = useState<"idle" | "saving" | "unavailable" | "upgrade">(
    canConnect(tier) ? "idle" : "upgrade",
  );
  const [saved, setSaved] = useState<{ url: string; name: string } | null>(null);

  if (state === "unavailable") return null;

  async function save() {
    setState("saving");
    try {
      const res = await postJson<{ url: string; name: string; site: string }>(
        `/api/meetings/${meetingId}/sharepoint`,
        {},
      );
      setSaved({ url: res.url, name: res.name });
      setState("idle");
      toast(`Saved to ${res.site}.`, "ok");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not save those notes";
      if (isUpgradeError(err)) {
        setState("upgrade");
        return;
      }
      toast(message, "error");
      setState(/connect microsoft|choose a sharepoint|cannot reach sharepoint/i.test(message) ? "unavailable" : "idle");
    }
  }

  return (
    <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-panel-border pt-4">
      {state === "upgrade" ? (
        <UpgradeNote reason="connect" />
      ) : (
        <button onClick={save} disabled={state === "saving"} className="btn btn-ghost !py-1.5 text-xs disabled:opacity-50">
          {state === "saving" ? "Saving…" : saved ? "Save another copy" : "Save notes to SharePoint"}
        </button>
      )}
      {state === "upgrade" ? null : saved ? (
        <span className="text-xs text-faint">
          Saved as {saved.name}
          {saved.url ? (
            <>
              {" · "}
              <a href={saved.url} target="_blank" rel="noreferrer" className="text-accent transition-opacity hover:opacity-70">
                open it
              </a>
            </>
          ) : null}
        </span>
      ) : (
        <span className="text-xs text-faint">Writes them into your site&rsquo;s document library.</span>
      )}
    </div>
  );
}
