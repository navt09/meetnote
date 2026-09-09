import "server-only";
import { NextResponse } from "next/server";
import { getAuth, type Auth } from "./supabase/server";
import { tierFor } from "./account-store";
import { canUseAi, UPGRADE_MESSAGE, type Tier } from "./account";

/**
 * One place to answer "may this caller do the thing that costs money".
 *
 * Every route that spends on transcription or the model goes through
 * requirePaid, so adding a new one can't accidentally skip the check.
 */

export type Allowed = { auth: Auth; tier: Tier };

export async function requireSignedIn(req: Request): Promise<Allowed | NextResponse> {
  const auth = await getAuth(req);
  if (!auth) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const tier = await tierFor(auth.user.id, auth.user.email);
  return { auth, tier };
}

export async function requirePaid(req: Request): Promise<Allowed | NextResponse> {
  const result = await requireSignedIn(req);
  if (result instanceof NextResponse) return result;
  if (!canUseAi(result.tier)) {
    // 402 says plainly that this is about payment, not permission.
    return NextResponse.json({ error: UPGRADE_MESSAGE, upgrade: true }, { status: 402 });
  }
  return result;
}

export function isBlocked(value: Allowed | NextResponse): value is NextResponse {
  return value instanceof NextResponse;
}

/**
 * Owner-only routes. Kept separate from requirePaid because the two answer
 * different questions: one is about money, this one is about who runs the
 * product. Owner comes from OWNER_EMAILS, so a database row can never grant it.
 */
export async function requireOwner(req: Request): Promise<Allowed | NextResponse> {
  const result = await requireSignedIn(req);
  if (result instanceof NextResponse) return result;
  if (result.tier !== "owner") {
    // 404 rather than 403: a non-owner has no reason to learn this route exists.
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return result;
}
