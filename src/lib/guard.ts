import "server-only";
import { NextResponse } from "next/server";
import { getAuth, type Auth } from "./supabase/server";
import { meetingsUsedThisMonth, tierFor } from "./account-store";
import { canConnect, canDraft, hasMeetingsLeft, UPGRADE_MESSAGES, type Tier, type UpgradeReason } from "./account";

/**
 * One place to answer "may this caller do the thing".
 *
 * Every route that costs money or reaches a third party goes through one of
 * these, so adding a route cannot accidentally skip the check. The UI hides
 * what a free account cannot do, but the UI is not the boundary: these are.
 */

export type Allowed = { auth: Auth; tier: Tier };

export function isBlocked(value: Allowed | NextResponse): value is NextResponse {
  return value instanceof NextResponse;
}

/**
 * 402 rather than 403: this is about money, not permission, and the browser
 * uses the code to tell an upgrade prompt apart from a real refusal. `reason`
 * says which wall was hit, so the prompt can name it.
 */
function upgradeRequired(reason: UpgradeReason): NextResponse {
  return NextResponse.json({ error: UPGRADE_MESSAGES[reason], upgrade: reason }, { status: 402 });
}

export async function requireSignedIn(req: Request): Promise<Allowed | NextResponse> {
  const auth = await getAuth(req);
  if (!auth) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const tier = await tierFor(auth.user.id, auth.user.email);
  return { auth, tier };
}

/**
 * Recording a meeting. Free accounts are metered rather than shut out: they
 * get notes and action items on a couple of meetings a month, because a trial
 * nobody can run is not a trial.
 */
export async function requireMeetingAllowance(req: Request): Promise<Allowed | NextResponse> {
  const result = await requireSignedIn(req);
  if (isBlocked(result)) return result;
  const used = await meetingsUsedThisMonth(result.auth.user.id);
  if (!hasMeetingsLeft(result.tier, used)) return upgradeRequired("allowance");
  return result;
}

/** Drafting a ticket or a follow-up email. */
export async function requireDrafting(req: Request): Promise<Allowed | NextResponse> {
  const result = await requireSignedIn(req);
  if (isBlocked(result)) return result;
  if (!canDraft(result.tier)) return upgradeRequired("draft");
  return result;
}

/**
 * Anything that touches a connected app: setting one up, delivering an
 * approved draft through it, posting to Slack, writing to a calendar.
 */
export async function requireConnections(req: Request): Promise<Allowed | NextResponse> {
  const result = await requireSignedIn(req);
  if (isBlocked(result)) return result;
  if (!canConnect(result.tier)) return upgradeRequired("connect");
  return result;
}

/**
 * Owner-only routes. Kept separate because it answers a different question:
 * not money, but who runs the product. Owner comes from OWNER_EMAILS, so a
 * database row can never grant it.
 */
export async function requireOwner(req: Request): Promise<Allowed | NextResponse> {
  const result = await requireSignedIn(req);
  if (isBlocked(result)) return result;
  if (result.tier !== "owner") {
    // 404 rather than 403: a non-owner has no reason to learn this route exists.
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return result;
}
