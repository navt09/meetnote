import { NextResponse } from "next/server";
import { getAuth } from "@/lib/supabase/server";
import { sortDrafts, toPublicDraft, type DraftRow } from "@/lib/draft";

export const runtime = "nodejs";

type Joined = DraftRow & { meetings: { title: string } | null };

/** Everything waiting on the caller's approval, plus what they already decided. */
export async function GET(req: Request) {
  const auth = await getAuth(req);
  if (!auth) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const { data, error } = await auth.db
    .from("drafts")
    .select("*, meetings(title)")
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    console.error(JSON.stringify({ event: "drafts_list_error", message: error.message }));
    return NextResponse.json({ error: "Could not load your drafts." }, { status: 500 });
  }
  const drafts = ((data ?? []) as Joined[]).map((r) => toPublicDraft(r, r.meetings?.title ?? "Untitled meeting"));
  return NextResponse.json({ drafts: sortDrafts(drafts) });
}
