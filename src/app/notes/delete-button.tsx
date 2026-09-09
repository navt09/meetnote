"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { deleteJson } from "@/lib/upload";
import { useToast } from "@/components/toast";

export default function DeleteMeetingButton({ id, afterDelete }: { id: string; afterDelete?: "list" }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);

  async function run() {
    setBusy(true);
    try {
      await deleteJson(`/api/meetings/${id}`);
      toast("Meeting deleted", "ok");
      if (afterDelete === "list") router.push("/notes");
      else router.refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Delete failed", "error");
      setBusy(false);
      setConfirming(false);
    }
  }

  if (!confirming) {
    return (
      <button className="btn btn-ghost !px-3 !py-1.5 text-xs text-muted hover:!text-danger" onClick={() => setConfirming(true)}>
        Delete
      </button>
    );
  }
  return (
    <span className="pop flex items-center gap-2 text-xs">
      <span className="text-muted">Delete audio and notes?</span>
      <button className="btn btn-danger !px-3 !py-1.5 text-xs" disabled={busy} onClick={run}>{busy ? "Deleting…" : "Yes"}</button>
      <button className="btn btn-ghost !px-3 !py-1.5 text-xs" disabled={busy} onClick={() => setConfirming(false)}>Cancel</button>
    </span>
  );
}
