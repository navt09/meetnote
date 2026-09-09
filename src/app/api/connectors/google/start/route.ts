import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { getAuth } from "@/lib/supabase/server";
import { authUrl, googleConfigured } from "@/lib/providers/google";

export const runtime = "nodejs";

export const STATE_COOKIE = "google_oauth_state";

/** Begins the Google consent flow. */
export async function GET(req: Request) {
  const auth = await getAuth(req);
  if (!auth) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  if (!googleConfigured()) {
    return NextResponse.json({ error: "Google isn't configured on this server yet." }, { status: 503 });
  }

  // Random state, stored in a short-lived httpOnly cookie and compared on the
  // way back, so another site cannot complete a connection on the user's behalf.
  const state = randomBytes(32).toString("base64url");
  const jar = await cookies();
  jar.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });

  return NextResponse.redirect(authUrl(new URL(req.url).origin, state));
}
