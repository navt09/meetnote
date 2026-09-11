import { describe, expect, it } from "vitest";
import { draftToClipboard, kindLabel, sortDrafts, toPublicDraft, type DraftRow, type PublicDraft } from "../draft";
import { DRAFT_NOTE_MAX, cleanDraftNote } from "../agent";

const draft = (over: Partial<PublicDraft>): PublicDraft => ({
  id: "d", meetingId: "m", meetingTitle: "Standup", taskId: null, kind: "ticket", subject: "S", body: "B",
  recipient: null, status: "pending", approvedAt: null, sendTo: null, deliveredTo: null, externalUrl: null,
  createdAt: "2026-09-01T00:00:00Z", ...over,
});

describe("toPublicDraft", () => {
  it("drops the fields the browser has no business seeing", () => {
    const row: DraftRow = {
      id: "d1", user_id: "u1", meeting_id: "m1", task_id: "t1", kind: "ticket", subject: "Fix it", body: "Body",
      recipient: null, status: "pending", approved_at: null, send_to: "linear", destination: null, external_url: null,
      model: "claude-opus-5", usage: { input_tokens: 10, output_tokens: 20 }, cost_usd: 0.5,
      created_at: "2026-09-01T00:00:00Z", updated_at: "2026-09-01T00:00:00Z",
    };
    const pub = toPublicDraft(row, "Standup") as unknown as Record<string, unknown>;
    for (const hidden of ["user_id", "usage", "cost_usd", "model", "updated_at", "destination"]) {
      expect(pub).not.toHaveProperty(hidden);
    }
    // The raw column stays behind; where it went comes across under a name
    // that cannot be mistaken for where it was meant to go. It is the
    // reader's own draft, so telling them is the point, not a leak.
    expect(pub.deliveredTo).toBeNull();
    expect(pub.subject).toBe("Fix it");
    expect(pub.meetingTitle).toBe("Standup");
  });
});

describe("sortDrafts", () => {
  it("puts pending first, then approved, then dismissed", () => {
    const out = sortDrafts([
      draft({ id: "dismissed", status: "dismissed" }),
      draft({ id: "approved", status: "approved" }),
      draft({ id: "pending", status: "pending" }),
    ]);
    expect(out.map((d) => d.id)).toEqual(["pending", "approved", "dismissed"]);
  });
  it("orders newest first within a status", () => {
    const out = sortDrafts([
      draft({ id: "old", createdAt: "2026-01-01T00:00:00Z" }),
      draft({ id: "new", createdAt: "2026-09-01T00:00:00Z" }),
    ]);
    expect(out.map((d) => d.id)).toEqual(["new", "old"]);
  });
  it("does not mutate the input", () => {
    const input = [draft({ id: "a", status: "approved" }), draft({ id: "b", status: "pending" })];
    sortDrafts(input);
    expect(input.map((d) => d.id)).toEqual(["a", "b"]);
  });
});

describe("draftToClipboard", () => {
  it("renders a ticket as markdown with the title as a heading", () => {
    expect(draftToClipboard({ kind: "ticket", subject: "Fix crash", body: "**Context**\nIt crashes.", recipient: null }))
      .toBe("# Fix crash\n\n**Context**\nIt crashes.\n");
  });
  it("renders an email with a To line when there is a recipient", () => {
    expect(draftToClipboard({ kind: "email", subject: "Icons", body: "Hi Priya", recipient: "Priya" }))
      .toBe("To: Priya\nSubject: Icons\n\nHi Priya\n");
  });
  it("omits the To line when nobody is named", () => {
    expect(draftToClipboard({ kind: "email", subject: "Icons", body: "Hi", recipient: null }))
      .toBe("Subject: Icons\n\nHi\n");
  });
});

describe("cleanDraftNote", () => {
  it("trims the ends", () => {
    expect(cleanDraftNote("  ask about the timeline  ")).toBe("ask about the timeline");
  });
  it("collapses runs of whitespace, newlines included", () => {
    expect(cleanDraftNote("ask about\n\n  the   timeline\ttoo")).toBe("ask about the timeline too");
  });
  it("caps the length", () => {
    const out = cleanDraftNote("a".repeat(DRAFT_NOTE_MAX + 50));
    expect(out).toHaveLength(DRAFT_NOTE_MAX);
  });
  it("does not leave a trailing space when the cap lands mid-gap", () => {
    const out = cleanDraftNote(`${"a".repeat(DRAFT_NOTE_MAX - 1)} tail`);
    expect(out).toBe("a".repeat(DRAFT_NOTE_MAX - 1));
  });
  it("returns null for empty or whitespace-only input", () => {
    expect(cleanDraftNote("")).toBeNull();
    expect(cleanDraftNote("   \n\t ")).toBeNull();
  });
  it("returns null for anything that is not a string", () => {
    for (const bad of [undefined, null, 42, {}, ["a note"], true]) {
      expect(cleanDraftNote(bad)).toBeNull();
    }
  });
});

describe("kindLabel", () => {
  it("reads as a word, and not as one of the places it might go", () => {
    // The stored kind is still "ticket", but only two of the four destinations
    // make a ticket, so the word a person reads is the broader one.
    expect(kindLabel("ticket")).toBe("Follow-up");
    expect(kindLabel("email")).toBe("Email");
  });
});
