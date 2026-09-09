import { NextResponse } from "next/server";
import { getAuth } from "@/lib/supabase/server";
import { issueState } from "@/lib/oauth-state";
import { authUrl, linearOAuthConfigured } from "@/lib/providers/linear-oauth";

export const runtime = "nodejs";

/** Begins the Linear consent flow. */
export async function GET(req: Request) {
  const auth = await getAuth(req);
  if (!auth) return NextResponse.redirect(new URL("/login?next=/settings", new URL(req.url).origin));
  if (!linearOAuthConfigured()) {
    return NextResponse.json({ error: "Linear isn't configured on this server yet." }, { status: 503 });
  }
  const state = await issueState("linear");
  return NextResponse.redirect(authUrl(new URL(req.url).origin, state));
}
