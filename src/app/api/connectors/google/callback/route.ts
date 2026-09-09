import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getAuth } from "@/lib/supabase/server";
import { saveConnector } from "@/lib/connector-store";
import { safeEqual } from "@/lib/crypto";
import { exchangeCode, SCOPES } from "@/lib/providers/google";
import { STATE_COOKIE } from "../start/route";
import type { GoogleConfig, GoogleCredentials } from "@/lib/connectors";

export const runtime = "nodejs";
export const maxDuration = 60;

function back(origin: string, params: Record<string, string>) {
  const url = new URL("/settings", origin);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return NextResponse.redirect(url);
}

/** Where Google sends the user back. Turns the code into a stored refresh token. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const origin = url.origin;

  const auth = await getAuth(req);
  if (!auth) return NextResponse.redirect(new URL("/login?next=/settings", origin));

  const jar = await cookies();
  const expected = jar.get(STATE_COOKIE)?.value ?? "";
  jar.delete(STATE_COOKIE);

  const returned = url.searchParams.get("state") ?? "";
  if (!expected || !safeEqual(expected, returned)) {
    return back(origin, { error: "That Google connection attempt expired or didn't match. Try again." });
  }

  const denied = url.searchParams.get("error");
  if (denied) return back(origin, { error: denied === "access_denied" ? "You declined the Google permissions." : "Google reported a problem." });

  const code = url.searchParams.get("code");
  if (!code) return back(origin, { error: "Google didn't return an authorisation code." });

  try {
    const { tokens, scopes } = await exchangeCode(origin, code);

    // Granular consent lets people untick individual permissions, so record
    // what was actually granted and tell them if something they need is missing.
    const missing = SCOPES.filter((s) => !scopes.includes(s));
    const credentials: GoogleCredentials = {
      refreshToken: tokens.refresh_token!,
      accessToken: tokens.access_token,
      expiresAt: Date.now() + tokens.expires_in * 1000,
    };
    const config: GoogleConfig = { scopes };
    await saveConnector(auth.user.id, "google", credentials, config);

    if (missing.length > 0) {
      const what = missing.some((s) => s.includes("gmail")) ? "sending email" : "reading your calendar";
      return back(origin, { notice: `Google connected, but permission for ${what} wasn't granted. Reconnect to enable it.` });
    }
    return back(origin, { notice: "Google connected." });
  } catch (err) {
    console.error(JSON.stringify({ event: "google_callback_error", message: err instanceof Error ? err.message : String(err) }));
    return back(origin, { error: err instanceof Error ? err.message : "Couldn't finish connecting Google." });
  }
}
