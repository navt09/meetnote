import { describe, expect, it } from "vitest";
import { draftToClipboard, kindLabel, sortDrafts, toPublicDraft, type DraftRow, type PublicDraft } from "../draft";

const draft = (over: Partial<PublicDraft>): PublicDraft => ({
  id: "d", meetingId: "m", meetingTitle: "Standup", taskId: null, kind: "ticket", subject: "S", body: "B",
  recipient: null, status: "pending", approvedAt: null, externalUrl: null, createdAt: "2026-09-01T00:00:00Z", ...over,
});

describe("toPublicDraft", () => {
  it("drops the fields the browser has no business seeing", () => {
    const row: DraftRow = {
      id: "d1", user_id: "u1", meeting_id: "m1", task_id: "t1", kind: "ticket", subject: "Fix it", body: "Body",
      recipient: null, status: "pending", approved_at: null, destination: null, external_url: null,
      model: "claude-opus-5", usage: { input_tokens: 10, output_tokens: 20 }, cost_usd: 0.5,
      created_at: "2026-09-01T00:00:00Z", updated_at: "2026-09-01T00:00:00Z",
    };
    const pub = toPublicDraft(row, "Standup") as unknown as Record<string, unknown>;
    for (const hidden of ["user_id", "usage", "cost_usd", "model", "updated_at", "destination"]) {
      expect(pub).not.toHaveProperty(hidden);
    }
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

describe("kindLabel", () => {
  it("reads as a word", () => {
    expect(kindLabel("ticket")).toBe("Ticket");
    expect(kindLabel("email")).toBe("Email");
  });
});
