import { TICKET_PROVIDERS, type Provider, type TicketProvider } from "./connectors";

/**
 * Where a ticket is going, said out loud.
 *
 * A button that says "draft ticket" is a button that does not say what will
 * happen when you approve what it writes. There are four real answers and they
 * behave completely differently: it will become a Linear issue, it will become
 * a Jira issue, it will go nowhere because the destination you chose is not
 * connected, or it will go nowhere because you never chose one. The last is
 * the trap, because everything looks connected and approving still delivers
 * nothing: `deliverTicket` reads the chosen provider and gives up when it is
 * null, so connecting Linear without choosing it does nothing at all.
 *
 * Pure and free of the database so the same sentence can be shown on the
 * button, on the task row and on the draft awaiting approval, rather than each
 * place inventing its own wording.
 *
 * Slack is deliberately absent. It receives meeting summaries and never
 * tickets, so it is not a destination a ticket can have, and offering it as
 * one would be a lie that only shows up after somebody approves something.
 */

export type TicketDestination = {
  /** The provider chosen in Settings, or null when nobody has chosen. */
  chosen: TicketProvider | null;
  /** Every ticket provider that is actually connected. */
  connected: TicketProvider[];
};

export const NO_TICKET_DESTINATION: TicketDestination = { chosen: null, connected: [] };

const NAMES: Record<Provider, string> = { linear: "Linear", jira: "Jira", slack: "Slack", google: "Google" };

export function providerName(p: Provider): string {
  return NAMES[p];
}

export function isTicketProvider(p: string | null | undefined): p is TicketProvider {
  return TICKET_PROVIDERS.includes(p as TicketProvider);
}

/**
 * The provider an approval would actually reach, or null when it would reach
 * nothing. Both halves have to hold: chosen in Settings *and* connected.
 */
export function deliversTo(d: TicketDestination): TicketProvider | null {
  if (!d.chosen) return null;
  return d.connected.includes(d.chosen) ? d.chosen : null;
}

/**
 * What the draft button should say. It names the destination when there is
 * one, and says plainly that there is not when there is not, because "draft
 * ticket" reads as though something is going to happen either way.
 */
export function draftTicketLabel(d: TicketDestination): string {
  const to = deliversTo(d);
  return to ? `draft ${providerName(to)} issue` : "draft ticket to copy";
}

/**
 * One sentence on what approving will do, for the draft waiting on a decision.
 * This is the moment it matters: after this press the thing either exists in
 * someone else's tracker or it does not.
 */
export function ticketDestinationNote(d: TicketDestination): string {
  const to = deliversTo(d);
  if (to) return `Approving creates this as an issue in ${providerName(to)}.`;

  if (d.chosen) {
    return `${providerName(d.chosen)} is where your tickets are set to go, but it is not connected. Approving keeps this here to copy.`;
  }
  if (d.connected.length > 0) {
    const names = d.connected.map(providerName).join(" and ");
    return `${names} ${d.connected.length > 1 ? "are" : "is"} connected, but you have not chosen where tickets go. Pick one in Settings, or approve this and copy it out.`;
  }
  return "Nothing is connected, so approving keeps this here to copy.";
}
