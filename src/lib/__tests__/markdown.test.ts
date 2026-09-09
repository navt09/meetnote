import { describe, expect, it } from "vitest";
import { notesToMarkdown } from "../markdown";
import type { MeetingNotes } from "../schema";

const notes: MeetingNotes = {
  title: "Standup",
  summary: "Short meeting.",
  key_points: ["Login refactor done"],
  action_items: [
    { title: "Fix mobile search crash", details: "Crashes on Safari.", owner: "Marcus", due: "Thursday", priority: "high", kind: "bug" },
    { title: "Email Priya", details: "", owner: null, due: null, priority: "medium", kind: "follow_up" },
  ],
  decisions: [{ decision: "Postpone dark mode", context: "Design not ready" }],
  people_to_contact: [{ name: "Priya", role: "Design", why: "Final icons" }],
  open_questions: ["Root cause of the crash?"],
};

describe("notesToMarkdown", () => {
  it("renders every section with checkboxes for tasks", () => {
    const md = notesToMarkdown(notes);
    expect(md).toContain("# Standup");
    expect(md).toContain("- [ ] **Fix mobile search crash** (Marcus · high · bug · due Thursday)");
    expect(md).toContain("- [ ] **Email Priya** (unassigned · medium · follow_up)");
    expect(md).toContain("## Decisions");
    expect(md).toContain("**Priya** (Design): Final icons");
    expect(md).toContain("- Root cause of the crash?");
    expect(md.endsWith("\n")).toBe(true);
  });

  it("omits empty sections and says when there are no tasks", () => {
    const md = notesToMarkdown({ ...notes, key_points: [], action_items: [], decisions: [], people_to_contact: [], open_questions: [] });
    expect(md).not.toContain("## Key points");
    expect(md).not.toContain("## Decisions");
    expect(md).toContain("## Action items (0)");
    expect(md).toContain("_None_");
  });
});
