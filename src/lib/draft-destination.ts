import type { DraftKind } from "./draft";
import type { Provider, TicketProvider } from "./connectors";

/**
 * Where a drafted follow-up is going, decided per draft.
 *
 * It used to be one setting for the whole account, which was wrong in two
 * ways. Meetings do not all feed the same place — engineering work goes to the
 * tracker, a nudge to the team goes to Slack, and plenty of follow-ups are
 * only ever meant to be read and pasted somewhere else. And a single hidden
 * setting meant the button said "draft ticket" while the answer to "which
 * ticket system" lived on another page.
 *
 * The choice is made at approval rather than before drafting, because the
 * draft itself is identical either way: Linear and Jira both take the same
 * Markdown and Jira converts it at send. Choosing first would mean deciding
 * before you had read the thing you were deciding about.
 *
 * A destination is suggested, never assumed. The rules below are plain string
 * matching with no model involved, and the suggestion lands on a control the
 * person can change, in the same spirit as `first_step`: the product may
 * propose, but the meeting did not decide this and neither does the product.
 */

export type SendTo = "linear" | "jira" | "slack" | "gmail" | "copy";

/** Why a destination was suggested, so the UI can say it out loud. */
export type SuggestionReason = "named" | "preference" | "only" | "none";
export type Suggestion = { to: SendTo; because: SuggestionReason; named?: string };

export type DestinationContext = {
  /** Every connector this person has set up. */
  connected: Provider[];
  /** The account-wide ticket destination, from Settings. Null when unset. */
  preferred: TicketProvider | null;
};

export const NO_DESTINATIONS: DestinationContext = { connected: [], preferred: null };

const NAMES: Record<SendTo, string> = {
  linear: "Linear",
  jira: "Jira",
  slack: "Slack",
  gmail: "Gmail",
  copy: "Copy only",
};

export function destinationName(to: SendTo): string {
  return NAMES[to];
}

/**
 * The destinations this kind of draft could go to, given what is connected.
 * "copy" is always last and always present: it is the honest answer when
 * nothing is set up, and a legitimate choice when everything is.
 */
export function destinationsFor(kind: DraftKind, ctx: DestinationContext): SendTo[] {
  if (kind === "email") {
    // An email goes to a person, so the only machine that can send it is their
    // mail. Slack would be a different message to a different audience.
    return ctx.connected.includes("google") ? ["gmail", "copy"] : ["copy"];
  }
  const order: SendTo[] = ["linear", "jira", "slack"];
  return [...order.filter((p) => ctx.connected.includes(p as Provider)), "copy"];
}

/**
 * Did the meeting name a destination out loud? This is the only real signal
 * there is. Issue keys do not discriminate — Linear and Jira both look like
 * ENG-123 — and nothing else in a task's wording says where it belongs.
 *
 * Matched on a word boundary so "linearly" and "slacking" do not count.
 */
export function namedDestination(text: string, allowed: SendTo[]): SendTo | null {
  const haystack = (text ?? "").toLowerCase();
  for (const to of allowed) {
    if (to === "copy") continue;
    if (new RegExp(`\\b${to}\\b`).test(haystack)) return to;
  }
  return null;
}

/**
 * The destination to start from. Named in the meeting beats the account
 * setting, which beats "there is only one place it could go", which beats
 * copying it out by hand.
 *
 * The third rule matters more than it looks: connecting Linear and never
 * choosing it in Settings used to deliver nothing at all, silently, because
 * delivery read the setting and gave up on null.
 */
export function suggestDestination(kind: DraftKind, text: string, ctx: DestinationContext): Suggestion {
  const allowed = destinationsFor(kind, ctx);
  const sendable = allowed.filter((d) => d !== "copy");

  const named = namedDestination(text, allowed);
  if (named) return { to: named, because: "named", named: destinationName(named) };

  if (kind !== "email" && ctx.preferred && sendable.includes(ctx.preferred)) {
    return { to: ctx.preferred, because: "preference" };
  }
  if (sendable.length === 1) return { to: sendable[0], because: "only" };
  return { to: "copy", because: "none" };
}

/**
 * One sentence on what the next press will do. Read immediately before making
 * it, so it has to name the press that is actually there: a draft already
 * approved but never sent is waiting on Send, not on Approve, and telling it
 * to approve again would describe a button that is not on the card.
 */
export function destinationNote(to: SendTo, kind: DraftKind, act: "approve" | "send" = "approve"): string {
  const doing = act === "approve" ? "Approving" : "Sending";
  switch (to) {
    case "linear":
      return `${doing} creates this as an issue in Linear.`;
    case "jira":
      return `${doing} creates this as an issue in Jira.`;
    case "slack":
      return `${doing} posts this to your Slack channel. It will not be tracked or assigned to anyone.`;
    case "gmail":
      return `${doing} sends this from your Gmail.`;
    default:
      return kind === "email"
        ? "Approving marks it done and keeps it here for you to copy. Nothing is sent."
        : "Approving marks it done and keeps it here for you to copy. Nothing is created anywhere.";
  }
}

/**
 * What happened, once a draft has been approved. Read on the Approved list,
 * where the question is no longer "where will this go" but "where did it go",
 * and those are different facts: an approval whose send failed has an intent
 * and no receipt, and saying "Sent to Linear" for it would be a lie.
 *
 * Each destination gets its own verb because they are not the same act. A
 * tracker gains an issue, a channel gains a message, a mailbox sends.
 */
export function deliveredLabel(to: SendTo | null): string {
  switch (to) {
    case "linear":
      return "Sent to Linear";
    case "jira":
      return "Sent to Jira";
    case "slack":
      return "Posted to Slack";
    case "gmail":
      return "Sent with Gmail";
    default:
      return "Not sent, kept to copy";
  }
}

export function isSendTo(v: string | null | undefined): v is SendTo {
  return v === "linear" || v === "jira" || v === "slack" || v === "gmail" || v === "copy";
}
