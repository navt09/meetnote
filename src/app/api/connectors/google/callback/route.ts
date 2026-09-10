import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getAuth } from "@/lib/supabase/server";
import { saveConnector } from "@/lib/connector-store";
import { safeEqual } from "@/lib/crypto";
import { backToSettings } from "@/lib/oauth-state";
import { exchangeCode, SCOPES } from "@/lib/providers/google";
import { STATE_COOKIE } from "../start/route";
import type { GoogleConfig, GoogleCredentials } from "@/lib/connectors";
import type { SettingsFlashCode } from "@/lib/flash";

export const runtime = "nodejs";
export const maxDuration = 60;

function back(origin: string, flash: { error: SettingsFlashCode } | { notice: SettingsFlashCode }) {
  return NextResponse.redirect(backToSettings(origin, flash));
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
    return back(origin, { error: "google_expired" });
  }

  const denied = url.searchParams.get("error");
  if (denied) {
    console.error(JSON.stringify({ event: "google_denied", reason: denied.slice(0, 100) }));
    return back(origin, { error: denied === "access_denied" ? "google_declined" : "google_provider_error" });
  }

  const code = url.searchParams.get("code");
  if (!code) return back(origin, { error: "google_no_code" });

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
      return back(origin, { notice: missing.some((s) => s.includes("gmail")) ? "google_partial_gmail" : "google_partial_calendar" });
    }
    return back(origin, { notice: "google_connected" });
  } catch (err) {
    // Google's own wording stays in the log; the page shows a fixed sentence.
    console.error(JSON.stringify({ event: "google_callback_error", message: err instanceof Error ? err.message : String(err) }));
    return back(origin, { error: "google_failed" });
  }
}
