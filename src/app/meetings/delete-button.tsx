"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { deleteJson } from "@/lib/upload";

export default function DeleteMeetingButton({ id, afterDelete }: { id: string; afterDelete?: "list" }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);

  async function run() {
    setBusy(true);
    try {
      await deleteJson(`/api/meetings/${id}`);
      if (afterDelete === "list") router.push("/meetings");
      else router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Delete failed");
      setBusy(false);
      setConfirming(false);
    }
  }

  if (!confirming) {
    return <button className="btn btn-ghost !px-3 !py-1.5 text-xs text-danger" onClick={() => setConfirming(true)}>Delete</button>;
  }
  return (
    <span className="flex items-center gap-2 text-xs">
      <span className="text-muted">Delete audio and notes?</span>
      <button className="btn btn-danger !px-3 !py-1.5 text-xs" disabled={busy} onClick={run}>{busy ? "Deleting…" : "Yes, delete"}</button>
      <button className="btn btn-ghost !px-3 !py-1.5 text-xs" disabled={busy} onClick={() => setConfirming(false)}>Cancel</button>
    </span>
  );
}
