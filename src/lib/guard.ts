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
