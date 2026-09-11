import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { isBlocked, requireConnections } from "@/lib/guard";
import { authUrl, microsoftConfigured } from "@/lib/providers/microsoft";

export const runtime = "nodejs";

export const STATE_COOKIE = "microsoft_oauth_state";

/** Begins the Microsoft consent flow. */
export async function GET(req: Request) {
  // The gate is the point of the call here: this route only needs to know the
  // caller may connect an app. The identity comes back on the callback with
  // the state cookie.
  const gate = await requireConnections(req);
  if (isBlocked(gate)) return gate;
  if (!microsoftConfigured()) {
    return NextResponse.json({ error: "Microsoft isn't configured on this server yet." }, { status: 503 });
  }

  // Random state in a short-lived httpOnly cookie, compared on the way back,
  // so another site cannot complete a connection on the user's behalf.
  const state = randomBytes(32).toString("base64url");
  const jar = await cookies();
  jar.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });

  // `add` names one organisation-wide product to ask for on top of the base.
  // Anything else is ignored by scopesToRequest rather than trusted, so this
  // cannot be used to talk the consent screen into a wider permission.
  const add = new URL(req.url).searchParams.get("add");
  return NextResponse.redirect(authUrl(new URL(req.url).origin, state, add));
}
