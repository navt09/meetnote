import { NextResponse } from "next/server";
import { getAuth } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export type SearchHit = {
  id: string;
  title: string;
  status: string;
  recordedAt: string;
  durationSeconds: number | null;
  summary: string | null;
  snippet: string | null;
  matchedIn: "title" | "summary" | "notes" | "transcript";
};

type Row = {
  id: string;
  title: string;
  status: string;
  recorded_at: string;
  duration_seconds: number | null;
  summary: string | null;
  snippet: string | null;
  matched_in: SearchHit["matchedIn"];
};

/**
 * Search the caller's own meetings.
 *
 * The query runs through search_meetings, a security-invoker function, so row
 * level security decides what is searchable. This route never filters by user
 * id itself; the database does, which is the boundary that actually holds.
 */
export async function GET(req: Request) {
  const auth = await getAuth(req);
  if (!auth) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const q = (new URL(req.url).searchParams.get("q") ?? "").trim();
  if (q.length < 2) return NextResponse.json({ hits: [], query: q });

  const { data, error } = await auth.db.rpc("search_meetings", { q });
  if (error) {
    console.error(JSON.stringify({ event: "search_error", message: error.message }));
    return NextResponse.json({ error: "Search failed. Try again." }, { status: 500 });
  }

  const hits: SearchHit[] = ((data ?? []) as Row[]).map((r) => ({
    id: r.id,
    title: r.title,
    status: r.status,
    recordedAt: r.recorded_at,
    durationSeconds: r.duration_seconds === null ? null : Number(r.duration_seconds),
    summary: r.summary,
    // Trimmed to a clean word boundary so a snippet never starts mid-word.
    snippet: r.snippet ? r.snippet.replace(/\s+/g, " ").replace(/^\S*\s/, "").trim() : null,
    matchedIn: r.matched_in,
  }));

  return NextResponse.json({ hits, query: q });
}
