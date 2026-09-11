import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getAuth } from "@/lib/supabase/server";
import { loadConnector, saveConnector } from "@/lib/connector-store";
import { safeEqual } from "@/lib/crypto";
import { backToSettings } from "@/lib/oauth-state";
import { exchangeCode, whoAmI } from "@/lib/providers/microsoft";
import { enableableProducts, hasScope } from "@/lib/microsoft-scopes";
import { STATE_COOKIE } from "../start/route";
import type { MicrosoftConfig, MicrosoftCredentials } from "@/lib/connectors";
import type { SettingsFlashCode } from "@/lib/flash";

export const runtime = "nodejs";
export const maxDuration = 60;

function back(origin: string, flash: { error: SettingsFlashCode } | { notice: SettingsFlashCode }) {
  return NextResponse.redirect(backToSettings(origin, flash));
}

/** Where Microsoft sends the user back. Turns the code into a stored refresh token. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const origin = url.origin;

  const auth = await getAuth(req);
  if (!auth) return NextResponse.redirect(new URL("/login?next=/settings", origin));

  const jar = await cookies();
  const expected = jar.get(STATE_COOKIE)?.value ?? "";
  jar.delete(STATE_COOKIE);

  const returned = url.searchParams.get("state") ?? "";
  if (!expected || !safeEqual(expected, returned)) return back(origin, { error: "microsoft_expired" });

  const denied = url.searchParams.get("error");
  if (denied) {
    console.error(JSON.stringify({ event: "microsoft_denied", reason: denied.slice(0, 100) }));
    return back(origin, { error: denied === "access_denied" ? "microsoft_declined" : "microsoft_provider_error" });
  }

  const code = url.searchParams.get("code");
  if (!code) return back(origin, { error: "microsoft_no_code" });

  try {
    // What this connection could already do. Consent is incremental, so
    // Microsoft returns only the scopes of the request just made, and taking
    // that literally would forget Outlook the moment somebody enabled Teams.
    const before = await loadConnector<MicrosoftCredentials, MicrosoftConfig>(auth.user.id, "microsoft");
    const { tokens, scopes, personal } = await exchangeCode(origin, code, before?.config.scopes);
    const credentials: MicrosoftCredentials = {
      refreshToken: tokens.refresh_token!,
      accessToken: tokens.access_token,
      expiresAt: Date.now() + tokens.expires_in * 1000,
    };

    // Who connected, so the card can say whose account this is. Asked for here
    // rather than later because it is the one moment a token is certainly
    // fresh, and a failure to read it must not fail the connection.
    let me: { name?: string; email?: string } = {};
    try {
      me = await whoAmI(tokens.access_token);
    } catch (err) {
      console.error(JSON.stringify({ event: "microsoft_me_failed", message: err instanceof Error ? err.message : String(err) }));
    }

    const config: MicrosoftConfig = { ...before?.config, scopes, personal, name: me.name, email: me.email };
    await saveConnector(auth.user.id, "microsoft", credentials, config);

    // Only the base is expected here. Teams and SharePoint are asked for
    // separately and only where they could work, so their absence is the
    // normal state rather than a partial connection.
    const partial = !hasScope(scopes, "Mail.Send") || enableableProducts(scopes, personal).length > 0;
    return back(origin, { notice: partial ? "microsoft_partial" : "microsoft_connected" });
  } catch (err) {
    // Microsoft's own wording stays in the log; the page shows a fixed sentence.
    console.error(JSON.stringify({ event: "microsoft_callback_error", message: err instanceof Error ? err.message : String(err) }));
    return back(origin, { error: "microsoft_failed" });
  }
}
