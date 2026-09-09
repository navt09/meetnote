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
  open_questions: ["Root cause of the crash?"], for_you: { committed: [], asked_of_you: [], heads_up: [], mentioned: [] },
};

describe("notesToMarkdown", () => {
  it("puts the personal section first and skips empty groups", () => {
    const md = notesToMarkdown({
      ...notes,
      for_you: { committed: ["Fix the crash by Thursday"], asked_of_you: [], heads_up: ["Dark mode is postponed"], mentioned: [] },
    });
    const forYou = md.indexOf("## For you");
    expect(forYou).toBeGreaterThan(0);
    expect(forYou).toBeLessThan(md.indexOf("## Key points"));
    expect(md).toContain("**You said you would**\n- Fix the crash by Thursday");
    expect(md).toContain("**Heads-up**\n- Dark mode is postponed");
    expect(md).not.toContain("Asked of you");
  });

  it("leaves the personal section out when every group is empty", () => {
    expect(notesToMarkdown(notes)).not.toContain("## For you");
  });


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
