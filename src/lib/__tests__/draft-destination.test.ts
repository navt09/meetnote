import { describe, it, expect } from "vitest";
import {
  approveLabel,
  deliveredLabel,
  destinationNote,
  destinationsFor,
  isSendTo,
  namedDestination,
  NO_DESTINATIONS,
  suggestDestination,
  type DestinationContext,
} from "../draft-destination";

const ctx = (
  connected: DestinationContext["connected"],
  preferred: DestinationContext["preferred"] = null,
  microsoftScopes: string[] = [],
) => ({ connected, preferred, microsoftScopes });

/** A Microsoft connection with everything a personal account can grant. */
const MS_BASE = ["Mail.Send", "Calendars.ReadWrite", "Tasks.ReadWrite", "Files.ReadWrite"];

describe("destinationsFor", () => {
  it("offers the connected trackers, then Slack, then copying it out", () => {
    expect(destinationsFor("ticket", ctx(["linear", "jira", "slack"]))).toEqual(["linear", "jira", "slack", "copy"]);
    expect(destinationsFor("ticket", ctx(["slack"]))).toEqual(["slack", "copy"]);
  });

  it("always offers copying, even with nothing connected", () => {
    expect(destinationsFor("ticket", NO_DESTINATIONS)).toEqual(["copy"]);
  });

  it("ignores Google for a follow-up, and everything but Google for an email", () => {
    // An email goes to one person's address. Posting it in a channel would be
    // a different message to a different audience.
    expect(destinationsFor("ticket", ctx(["google"]))).toEqual(["copy"]);
    expect(destinationsFor("email", ctx(["google", "slack"]))).toEqual(["gmail", "copy"]);
    expect(destinationsFor("email", ctx(["linear", "slack"]))).toEqual(["copy"]);
  });
});

describe("Microsoft destinations", () => {
  it("offers Outlook for an email and To Do for a follow-up", () => {
    expect(destinationsFor("email", ctx(["microsoft"], null, MS_BASE))).toEqual(["outlook", "copy"]);
    expect(destinationsFor("ticket", ctx(["microsoft"], null, MS_BASE))).toEqual(["todo", "copy"]);
  });

  it("offers both mailboxes when both are connected", () => {
    expect(destinationsFor("email", ctx(["google", "microsoft"], null, MS_BASE))).toEqual(["gmail", "outlook", "copy"]);
  });

  it("checks the scope, not the connection", () => {
    // One Microsoft sign-in covers several products, and a personal account or
    // a strict tenant can withhold any of them, so being connected says
    // nothing about what is reachable.
    expect(destinationsFor("email", ctx(["microsoft"], null, ["Tasks.ReadWrite"]))).toEqual(["copy"]);
    expect(destinationsFor("ticket", ctx(["microsoft"], null, ["Mail.Send"]))).toEqual(["copy"]);
    expect(destinationsFor("email", ctx(["microsoft"]))).toEqual(["copy"]);
  });

  it("suggests the only place there is", () => {
    expect(suggestDestination("ticket", "Fix the export", ctx(["microsoft"], null, MS_BASE))).toEqual({
      to: "todo",
      because: "only",
    });
  });
});

describe("namedDestination", () => {
  it("takes the meeting at its word", () => {
    expect(namedDestination("Raise a Jira for the export crash", ["linear", "jira", "copy"])).toBe("jira");
    expect(namedDestination("put it in linear", ["linear", "jira", "copy"])).toBe("linear");
    expect(namedDestination("drop a note in Slack", ["slack", "copy"])).toBe("slack");
  });

  it("will not name something that is not connected", () => {
    expect(namedDestination("Raise a Jira for this", ["linear", "copy"])).toBeNull();
  });

  it("needs a whole word, not a fragment of one", () => {
    // The failure this guards: "linear regression" and "slacking off" are not
    // instructions about where work goes.
    expect(namedDestination("the linearly interpolated figures", ["linear", "copy"])).toBeNull();
    expect(namedDestination("we have been slacking on this", ["slack", "copy"])).toBeNull();
  });

  it("never hears To Do or a mailbox in ordinary speech", () => {
    // "we need to do this" is in every meeting, and an email's mailbox is a
    // matter of the account rather than of anything that was said.
    expect(namedDestination("we still need to do the migration", ["todo", "copy"])).toBeNull();
    expect(namedDestination("send it from outlook", ["outlook", "copy"])).toBeNull();
    expect(namedDestination("gmail it to her", ["gmail", "copy"])).toBeNull();
  });

  it("is null when nothing is named", () => {
    expect(namedDestination("Fix the export crash on large files", ["linear", "jira", "slack", "copy"])).toBeNull();
    expect(namedDestination("", ["linear", "copy"])).toBeNull();
  });
});

describe("suggestDestination", () => {
  it("prefers what the meeting said over the account setting", () => {
    const s = suggestDestination("ticket", "Raise a Jira for the export crash", ctx(["linear", "jira"], "linear"));
    expect(s).toEqual({ to: "jira", because: "named", named: "Jira" });
  });

  it("falls back to the account setting", () => {
    const s = suggestDestination("ticket", "Fix the export crash", ctx(["linear", "jira"], "jira"));
    expect(s).toEqual({ to: "jira", because: "preference" });
  });

  it("uses the only connected place when nothing was chosen", () => {
    // The trap this closes: connecting Linear and never picking it in Settings
    // used to deliver nothing at all, silently.
    expect(suggestDestination("ticket", "Fix the export crash", ctx(["linear"]))).toEqual({ to: "linear", because: "only" });
  });

  it("does not guess between two connected places", () => {
    expect(suggestDestination("ticket", "Fix the export crash", ctx(["linear", "jira"]))).toEqual({
      to: "copy",
      because: "none",
    });
  });

  it("ignores an account setting whose connector is gone", () => {
    expect(suggestDestination("ticket", "Fix it", ctx(["slack"], "jira"))).toEqual({ to: "slack", because: "only" });
  });

  it("suggests copying when nothing is connected", () => {
    expect(suggestDestination("ticket", "Fix the export crash", NO_DESTINATIONS)).toEqual({ to: "copy", because: "none" });
  });

  it("never suggests a tracker for an email", () => {
    const s = suggestDestination("email", "Email Priya about the Linear issue", ctx(["linear", "google"], "linear"));
    expect(s.to).toBe("gmail");
  });
});

describe("destinationNote", () => {
  it("says what approving does, and warns that Slack tracks nothing", () => {
    expect(destinationNote("linear", "ticket")).toBe("Approving creates this as an issue in Linear.");
    expect(destinationNote("slack", "ticket")).toContain("not be tracked or assigned");
    expect(destinationNote("gmail", "email")).toBe("Approving sends this from your Gmail.");
  });

  it("names the press that is actually on the card", () => {
    // An approved draft that never went anywhere is waiting on Send, not on
    // Approve, and the sentence has to say so.
    expect(destinationNote("linear", "ticket", "send")).toBe("Sending creates this as an issue in Linear.");
    expect(destinationNote("slack", "ticket", "send")).toContain("Sending posts this");
  });

  it("names the Microsoft destinations too", () => {
    expect(destinationNote("outlook", "email")).toBe("Approving sends this from your Outlook.");
    expect(destinationNote("todo", "ticket")).toBe("Approving adds this to your Microsoft To Do list.");
    expect(deliveredLabel("outlook")).toBe("Sent with Outlook");
    expect(deliveredLabel("todo")).toBe("Added to To Do");
  });

  it("is plain that copying sends nothing", () => {
    expect(destinationNote("copy", "ticket")).toContain("Nothing is created anywhere");
    expect(destinationNote("copy", "email")).toContain("Nothing is sent");
  });
});

describe("deliveredLabel", () => {
  it("names where it went, with the verb that destination actually did", () => {
    expect(deliveredLabel("linear")).toBe("Sent to Linear");
    expect(deliveredLabel("jira")).toBe("Sent to Jira");
    expect(deliveredLabel("slack")).toBe("Posted to Slack");
    expect(deliveredLabel("gmail")).toBe("Sent with Gmail");
  });

  it("does not claim a send that never happened", () => {
    // Null is both "approved for copying" and "approved but the send failed".
    // Neither of them sent anything, which is the part that matters here.
    expect(deliveredLabel(null)).toBe("Not sent, kept to copy");
  });
});

describe("approveLabel", () => {
  it("says it sends, where it sends", () => {
    expect(approveLabel("linear")).toBe("Approve and send");
    expect(approveLabel("slack")).toBe("Approve and send");
    expect(approveLabel("gmail")).toBe("Approve and send");
  });

  it("does not promise a send that will not happen", () => {
    expect(approveLabel("copy")).toBe("Approve");
  });
});

describe("isSendTo", () => {
  it("accepts the real destinations and nothing else", () => {
    for (const v of ["linear", "jira", "slack", "gmail", "outlook", "todo", "copy"]) expect(isSendTo(v)).toBe(true);
    expect(isSendTo("github")).toBe(false);
    expect(isSendTo(null)).toBe(false);
  });
});
