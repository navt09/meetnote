import { NextResponse } from "next/server";
import { getAuth } from "@/lib/supabase/server";
import { cleanCompetitors } from "@/lib/signals";
import { setCompetitors } from "@/lib/settings-store";

export const runtime = "nodejs";

/**
 * The competitor names this account wants spotted in its calls.
 *
 * Not behind a paid gate. Finding a name in a transcript the account already
 * has is part of reading its own notes, which Free gets; it drafts nothing and
 * reaches no other app. An empty list clears it.
 */
export async function PUT(req: Request) {
  const auth = await getAuth(req);
  if (!auth) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  let body: { competitors?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const competitors = cleanCompetitors(body.competitors);
  try {
    await setCompetitors(auth.user.id, competitors);
    return NextResponse.json({ ok: true, competitors });
  } catch (err) {
    console.error(JSON.stringify({ event: "competitors_save_error", message: err instanceof Error ? err.message : String(err) }));
    return NextResponse.json({ error: "Could not save your competitors." }, { status: 500 });
  }
}
