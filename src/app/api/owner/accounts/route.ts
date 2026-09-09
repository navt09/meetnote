import { NextResponse } from "next/server";
import { requireOwner, isBlocked } from "@/lib/guard";
import { listAccounts } from "@/lib/owner-store";
import { setTier } from "@/lib/account-store";
import { isTier } from "@/lib/account";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Everyone who has ever signed up, with what they cost to run. */
export async function GET(req: Request) {
  const gate = await requireOwner(req);
  if (isBlocked(gate)) return gate;

  try {
    return NextResponse.json({ accounts: await listAccounts() });
  } catch (err) {
    console.error(JSON.stringify({ event: "owner_users_error", message: err instanceof Error ? err.message : "unknown" }));
    return NextResponse.json({ error: "Could not load accounts." }, { status: 500 });
  }
}

/** Move one account between tiers. The only way to grant a paid account today. */
export async function PATCH(req: Request) {
  const gate = await requireOwner(req);
  if (isBlocked(gate)) return gate;

  const body = (await req.json().catch(() => ({}))) as { userId?: unknown; tier?: unknown };
  const userId = typeof body.userId === "string" ? body.userId.trim() : "";
  const tier = typeof body.tier === "string" ? body.tier : "";

  if (!userId) return NextResponse.json({ error: "Which account?" }, { status: 400 });
  if (!isTier(tier)) return NextResponse.json({ error: "That is not a tier." }, { status: 400 });

  // Owner is granted by OWNER_EMAILS alone. Writing it here would create a
  // second, weaker path to the highest privilege in the product.
  if (tier === "owner") {
    return NextResponse.json({ error: "Owner is granted by OWNER_EMAILS, not from this page." }, { status: 400 });
  }
  if (userId === gate.auth.user.id) {
    return NextResponse.json({ error: "You cannot change your own tier here." }, { status: 400 });
  }

  try {
    await setTier(userId, tier, `set to ${tier} by owner`);
  } catch (err) {
    console.error(JSON.stringify({ event: "owner_set_tier_error", message: err instanceof Error ? err.message : "unknown" }));
    return NextResponse.json({ error: "Could not save that change." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, userId, tier });
}
