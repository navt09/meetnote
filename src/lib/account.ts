// Account tiers: who may do what, and how much of it.
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

/**
 * What a free account gets.
 *
 * Free is a real trial, not a locked door: record, get the transcript, the
 * notes and the action items, twice a month. Those two meetings cost us
 * transcription and a model call, which is the price of showing someone the
 * thing actually works on their own meeting rather than on a demo.
 *
 * What free does not get is the half that does the follow-up: drafting a
 * ticket or an email, and connecting Linear, Jira, Slack or Google. That is
 * the part worth paying for, so that is the part behind the wall.
 */
export const FREE_MEETINGS_PER_MONTH = 2;

/** Drafting a ticket or a follow-up email. */
export function canDraft(tier: Tier): boolean {
  return atLeast(tier, "active");
}

/**
 * Connecting a third-party app, and anything that reaches one: delivering an
 * approved draft, posting a summary to Slack, blocking a task out on a
 * calendar.
 */
export function canConnect(tier: Tier): boolean {
  return atLeast(tier, "active");
}

/** Meetings this tier may record in a calendar month. Paid accounts are uncapped. */
export function monthlyMeetingAllowance(tier: Tier): number {
  return atLeast(tier, "active") ? Number.POSITIVE_INFINITY : FREE_MEETINGS_PER_MONTH;
}

/** Whether one more meeting is allowed, given how many this month already holds. */
export function hasMeetingsLeft(tier: Tier, usedThisMonth: number): boolean {
  return usedThisMonth < monthlyMeetingAllowance(tier);
}

/** Meetings still available this month. Infinity reads as "no cap" to the caller. */
export function meetingsLeft(tier: Tier, usedThisMonth: number): number {
  return Math.max(0, monthlyMeetingAllowance(tier) - usedThisMonth);
}

/**
 * The first moment of the calendar month containing `now`, in UTC.
 *
 * UTC rather than the visitor's zone: the allowance is counted on the server,
 * and a boundary that moved with whoever was asking would let the same meeting
 * fall inside two different months.
 */
export function monthStart(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
}

/** Only the owner sees what each meeting costs us in vendor fees. */
export function canSeeInternals(tier: Tier): boolean {
  return tier === "owner";
}

export const TIER_LABEL: Record<Tier, string> = {
  free: "Free",
  active: "Pro",
  owner: "Owner",
};

export const TIER_BLURB: Record<Tier, string> = {
  free: `Notes and action items on ${FREE_MEETINGS_PER_MONTH} meetings a month. Drafting and connected apps are part of Pro.`,
  active: "Unlimited meetings, drafting, and everywhere the work goes.",
  owner: "Full access, plus the running cost of each meeting.",
};

/**
 * What to say when a free account reaches a wall. One per wall rather than one
 * for everything, because "upgrade" without saying what was refused is the
 * least useful message a product can show.
 */
export const UPGRADE_MESSAGES = {
  draft: "Drafting tickets and follow-up emails is part of Pro.",
  connect: "Connecting Linear, Jira, Slack and Google is part of Pro.",
  allowance: `Free accounts get ${FREE_MEETINGS_PER_MONTH} meetings a month, and yours are used up. Pro records as many as you like.`,
} as const;

export type UpgradeReason = keyof typeof UPGRADE_MESSAGES;
