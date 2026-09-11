import { supabaseServer } from "@/lib/supabase/server";
import { sortDrafts, toPublicDraft, type DraftRow } from "@/lib/draft";
import { destinationContextFor } from "@/lib/connector-store";
import { NO_DESTINATIONS } from "@/lib/draft-destination";
import ApprovalsView, { type DraftRequest } from "./approvals-view";

export const dynamic = "force-dynamic";
export const metadata = { title: "Approvals · From the Call" };

type Joined = DraftRow & { meetings: { title: string } | null };

/**
 * `for` and `id` mean somebody pressed draft rather than opening the tab, and
 * the writing is done here so the wait happens in front of the thing it
 * produces. Read on the server and handed down, so the view can start from it
 * instead of setting state inside an effect.
 */
function requestFrom(params: { for?: string; id?: string; who?: string }): DraftRequest | null {
  const id = (params.id ?? "").trim();
  if (!id) return null;
  if (params.for === "ticket") return { kind: "ticket", id };
  if (params.for === "email" && params.who?.trim()) return { kind: "email", id, who: params.who.trim() };
  return null;
}

export default async function ApprovalsPage({
  searchParams,
}: {
  searchParams: Promise<{ for?: string; id?: string; who?: string }>;
}) {
  const params = await searchParams;
  const db = await supabaseServer();
  const { data: userData } = await db.auth.getUser();

  const [draftsRes, destinations] = await Promise.all([
    db.from("drafts").select("*, meetings(title)").order("created_at", { ascending: false }).limit(200),
    userData.user ? destinationContextFor(userData.user.id) : Promise.resolve(NO_DESTINATIONS),
  ]);

  const drafts = sortDrafts(((draftsRes.data ?? []) as Joined[]).map((r) => toPublicDraft(r, r.meetings?.title ?? "Untitled meeting")));
  return (
    <ApprovalsView
      initial={drafts}
      destinations={destinations}
      writeRequest={requestFrom(params)}
      loadError={draftsRes.error ? "Could not load your drafts. Refresh to try again." : null}
    />
  );
}
