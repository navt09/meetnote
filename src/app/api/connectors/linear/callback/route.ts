import { NextResponse } from "next/server";
import { getAuth } from "@/lib/supabase/server";
import { saveConnector } from "@/lib/connector-store";
import { backToSettings, consumeState } from "@/lib/oauth-state";
import { exchangeCode } from "@/lib/providers/linear-oauth";
import { listTeams } from "@/lib/providers/linear";
import type { LinearConfig } from "@/lib/connectors";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Where Linear sends the user back. Stores the token and picks a team. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const origin = url.origin;

  const auth = await getAuth(req);
  if (!auth) return NextResponse.redirect(new URL("/login?next=/settings", origin));

  if (!(await consumeState("linear", url.searchParams.get("state")))) {
    return NextResponse.redirect(backToSettings(origin, { error: "linear_expired" }));
  }

  const denied = url.searchParams.get("error");
  if (denied) {
    console.error(JSON.stringify({ event: "linear_denied", reason: denied.slice(0, 100) }));
    return NextResponse.redirect(backToSettings(origin, { error: denied === "access_denied" ? "linear_declined" : "linear_provider_error" }));
  }

  const code = url.searchParams.get("code");
  if (!code) return NextResponse.redirect(backToSettings(origin, { error: "linear_no_code" }));

  try {
    const { credentials } = await exchangeCode(origin, code);

    // Pick the team straight away when there is only one, so the common case
    // is a single click with nothing else to fill in.
    const teams = await listTeams(credentials);
    if (teams.length === 0) {
      return NextResponse.redirect(backToSettings(origin, { error: "linear_no_teams" }));
    }
    const config: LinearConfig = teams.length === 1 ? { teamId: teams[0].id, teamName: teams[0].name } : {};

    await saveConnector(auth.user.id, "linear", credentials, config);
    // The team name is shown from the stored config once the page loads.
    return NextResponse.redirect(backToSettings(origin, { notice: config.teamName ? "linear_connected" : "linear_pick" }));
  } catch (err) {
    // Linear's own wording stays in the log; the page shows a fixed sentence.
    console.error(JSON.stringify({ event: "linear_callback_error", message: err instanceof Error ? err.message : String(err) }));
    return NextResponse.redirect(backToSettings(origin, { error: "linear_failed" }));
  }
}
