"use client";

import { useState } from "react";
import { postJson } from "@/lib/upload";
import { useToast } from "@/components/toast";
import { canConnect, type Tier } from "@/lib/account";
import { isUpgradeError, UpgradeNote } from "@/components/upgrade";

/**
 * Append this meeting's tasks to the Excel workbook chosen in Settings.
 *
 * A share, not a draft, for the same reason posting notes to Slack is: these
 * are the rows already on the page, copied unchanged into the person's own
 * spreadsheet. Approval exists for text a model wrote that somebody else will
 * read as the user's words, and there is none of that here.
 *
 * Repeatable on purpose. A register is a running list, and refusing a second
 * press would mean tracking what had already been written and being wrong
 * about it the first time somebody deleted a row by hand. What it did is said
 * plainly instead, so a second press is a choice rather than an accident.
 *
 * Hidden the moment it turns out there is nothing to write to: a page about a
 * meeting should not carry a standing complaint about Settings.
 */
export function AddToExcel({ meetingId, tier }: { meetingId: string; tier: Tier }) {
  const toast = useToast();
  const [state, setState] = useState<"idle" | "adding" | "unavailable" | "upgrade">(
    canConnect(tier) ? "idle" : "upgrade",
  );
  const [added, setAdded] = useState<number | null>(null);

  if (state === "unavailable") return null;

  async function add() {
    setState("adding");
    try {
      const { rows, workbook } = await postJson<{ rows: number; workbook: string }>(
        `/api/meetings/${meetingId}/excel`,
        {},
      );
      setAdded(rows);
      setState("idle");
      toast(`Added ${rows} ${rows === 1 ? "row" : "rows"} to ${workbook}.`, "ok");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not add those to Excel";
      // The tier can change between this page loading and this click.
      if (isUpgradeError(err)) {
        setState("upgrade");
        return;
      }
      toast(message, "error");
      // Neither "connect Microsoft" nor "choose a workbook" is worth a button
      // that stays on the page nagging about Settings.
      setState(/connect microsoft|choose a workbook|no tasks/i.test(message) ? "unavailable" : "idle");
    }
  }

  return (
    <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-panel-border pt-4">
      {state === "upgrade" ? (
        <UpgradeNote reason="connect" />
      ) : (
        <button onClick={add} disabled={state === "adding"} className="btn btn-ghost !py-1.5 text-xs disabled:opacity-50">
          {state === "adding" ? "Adding…" : added === null ? "Add tasks to Excel" : "Add them again"}
        </button>
      )}
      {state === "upgrade" ? null : (
        <span className="text-xs text-faint">
          {added === null
            ? "Appends every task to your workbook."
            : `${added} ${added === 1 ? "row" : "rows"} appended.`}
        </span>
      )}
    </div>
  );
}
