import { supabaseServer } from "@/lib/supabase/server";
import { sortDrafts, toPublicDraft, type DraftRow } from "@/lib/draft";
import ApprovalsView from "./approvals-view";

export const dynamic = "force-dynamic";
export const metadata = { title: "Approvals · From the Call" };

type Joined = DraftRow & { meetings: { title: string } | null };

export default async function ApprovalsPage() {
  const db = await supabaseServer();
  const { data, error } = await db
    .from("drafts")
    .select("*, meetings(title)")
    .order("created_at", { ascending: false })
    .limit(200);

  const drafts = sortDrafts(((data ?? []) as Joined[]).map((r) => toPublicDraft(r, r.meetings?.title ?? "Untitled meeting")));
  return <ApprovalsView initial={drafts} loadError={error ? "Could not load your drafts. Refresh to try again." : null} />;
}
