import { describe, it, expect } from "vitest";
import {
  deliversTo,
  draftTicketLabel,
  isTicketProvider,
  NO_TICKET_DESTINATION,
  ticketDestinationNote,
  type TicketDestination,
} from "../ticket-destination";

describe("deliversTo", () => {
  it("needs the destination both chosen and connected", () => {
    expect(deliversTo({ chosen: "linear", connected: ["linear"] })).toBe("linear");
    expect(deliversTo({ chosen: "jira", connected: ["jira", "linear"] })).toBe("jira");
  });

  it("is null when the chosen destination is not connected", () => {
    // Connecting one and choosing the other is a real state: the chooser and
    // the connect buttons are separate controls.
    expect(deliversTo({ chosen: "jira", connected: ["linear"] })).toBeNull();
    expect(deliversTo({ chosen: "linear", connected: [] })).toBeNull();
  });

  it("is null when nothing was ever chosen, however much is connected", () => {
    // The trap this whole module exists for. Everything looks connected and
    // approving still delivers nothing.
    expect(deliversTo({ chosen: null, connected: ["linear", "jira"] })).toBeNull();
    expect(deliversTo(NO_TICKET_DESTINATION)).toBeNull();
  });
});

describe("draftTicketLabel", () => {
  it("names the destination when there is one", () => {
    expect(draftTicketLabel({ chosen: "linear", connected: ["linear"] })).toBe("draft Linear issue");
    expect(draftTicketLabel({ chosen: "jira", connected: ["jira"] })).toBe("draft Jira issue");
  });

  it("says the draft is only to copy when nothing would receive it", () => {
    expect(draftTicketLabel(NO_TICKET_DESTINATION)).toBe("draft ticket to copy");
    expect(draftTicketLabel({ chosen: null, connected: ["linear"] })).toBe("draft ticket to copy");
    expect(draftTicketLabel({ chosen: "jira", connected: ["linear"] })).toBe("draft ticket to copy");
  });
});

describe("ticketDestinationNote", () => {
  it("says what approving will do", () => {
    expect(ticketDestinationNote({ chosen: "linear", connected: ["linear"] })).toBe(
      "Approving creates this as an issue in Linear.",
    );
  });

  it("names the disconnected destination rather than saying nothing is set up", () => {
    expect(ticketDestinationNote({ chosen: "jira", connected: [] })).toContain("Jira is where your tickets are set to go");
  });

  it("points at the choice when connectors exist but none was chosen", () => {
    const one = ticketDestinationNote({ chosen: null, connected: ["linear"] });
    expect(one).toContain("Linear is connected");
    expect(one).toContain("Settings");

    const both = ticketDestinationNote({ chosen: null, connected: ["linear", "jira"] });
    expect(both).toContain("Linear and Jira are connected");
  });

  it("is plain about there being nowhere to send it", () => {
    expect(ticketDestinationNote(NO_TICKET_DESTINATION)).toBe("Nothing is connected, so approving keeps this here to copy.");
  });

  it("never offers Slack as a ticket destination", () => {
    // Slack takes meeting summaries, never tickets. Naming it here would be a
    // lie that only surfaces after somebody approves something.
    const cases: TicketDestination[] = [
      NO_TICKET_DESTINATION,
      { chosen: "linear", connected: ["linear"] },
      { chosen: null, connected: ["jira"] },
    ];
    for (const d of cases) {
      expect(ticketDestinationNote(d)).not.toContain("Slack");
      expect(draftTicketLabel(d)).not.toContain("Slack");
    }
  });
});

describe("isTicketProvider", () => {
  it("accepts the two that take tickets and nothing else", () => {
    expect(isTicketProvider("linear")).toBe(true);
    expect(isTicketProvider("jira")).toBe(true);
    expect(isTicketProvider("slack")).toBe(false);
    expect(isTicketProvider("google")).toBe(false);
    expect(isTicketProvider(null)).toBe(false);
  });
});
