// Account tiers: who may record and spend money on transcription and drafting.
// The pure helpers here are unit-tested; the database side is in account-store.ts.

export type Tier = "free" | "active" | "owner";

export const TIERS: Tier[] = ["free", "active", "owner"];

const RANK: Record<Tier, number> = { free: 0, active: 1, owner: 2 };

export function isTier(value: string): value is Tier {
  return (TIERS as string[]).includes(value);
}

/** True when `tier` is at least as privileged as `minimum`. */
export function atLeast(tier: Tier, minimum: Tier): boolean {
  return RANK[tier] >= RANK[minimum];
}

/** Recording, transcription and drafting all cost real money, so they need a paid account. */
export function canUseAi(tier: Tier): boolean {
  return atLeast(tier, "active");
}

export function canRecord(tier: Tier): boolean {
  return atLeast(tier, "active");
}

/** Only the owner sees what each meeting costs us in vendor fees. */
export function canSeeInternals(tier: Tier): boolean {
  return tier === "owner";
}

export const TIER_LABEL: Record<Tier, string> = {
  free: "Free",
  active: "Active",
  owner: "Owner",
};

export const TIER_BLURB: Record<Tier, string> = {
  free: "You can read meetings you already have. Recording and AI notes need an active account.",
  active: "Full access to recording, notes, tasks and drafting.",
  owner: "Full access, plus the running cost of each meeting.",
};

/** The message shown when a free account tries to do something paid. */
export const UPGRADE_MESSAGE = "Recording and AI notes need an active account.";
