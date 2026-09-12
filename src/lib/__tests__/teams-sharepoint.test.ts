import { describe, it, expect } from "vitest";
import { escapeHtml, toTeamsHtml } from "../providers/teams";
import { fileNameFor } from "../providers/sharepoint";

describe("toTeamsHtml", () => {
  it("leads with the subject in bold and keeps paragraphs apart", () => {
    // Teams renders nothing but HTML: plain text arrives as one unbroken
    // paragraph with the Markdown still visible in it.
    const html = toTeamsHtml("Fix the export", "First para.\n\nSecond para.");
    expect(html).toBe("<p><b>Fix the export</b></p><p>First para.</p><p>Second para.</p>");
  });

  it("keeps single line breaks inside a paragraph", () => {
    expect(toTeamsHtml("S", "one\ntwo")).toContain("<p>one<br/>two</p>");
  });

  it("escapes everything that came out of a transcript", () => {
    // The whole reason this is hand-built rather than a Markdown renderer:
    // every feature added here is another way for someone's words to become
    // markup in somebody else's client.
    const html = toTeamsHtml("<script>alert(1)</script>", "a & b <b>not bold</b>");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("a &amp; b &lt;b&gt;not bold&lt;/b&gt;");
  });

  it("drops empty paragraphs rather than rendering blank ones", () => {
    expect(toTeamsHtml("S", "one\n\n\n\ntwo")).toBe("<p><b>S</b></p><p>one</p><p>two</p>");
    expect(toTeamsHtml("S", "")).toBe("<p><b>S</b></p>");
  });
});

describe("escapeHtml", () => {
  it("covers the four that matter in an attribute or a body", () => {
    expect(escapeHtml('& < > "')).toBe("&amp; &lt; &gt; &quot;");
    expect(escapeHtml("")).toBe("");
  });
});

describe("fileNameFor", () => {
  it("puts the date first so a library sorts by meeting", () => {
    expect(fileNameFor("Weekly standup", "2026-09-12T09:30:00Z")).toBe("2026-09-12 Weekly standup.md");
  });

  it("replaces characters a filename cannot hold, rather than removing them", () => {
    // "Q3/Q4 review" must not become "Q3Q4 review": a name that collapses two
    // different meetings into one is worse than a slightly longer one.
    expect(fileNameFor("Q3/Q4 review", "2026-09-12T00:00:00Z")).toBe("2026-09-12 Q3 Q4 review.md");
    expect(fileNameFor('a:b*c?d"e<f>g|h#i%j', "2026-09-12T00:00:00Z")).toBe("2026-09-12 a b c d e f g h i j.md");
  });

  it("never produces a nameless file", () => {
    expect(fileNameFor("", "2026-09-12T00:00:00Z")).toBe("2026-09-12 Meeting.md");
    expect(fileNameFor("   ", "2026-09-12T00:00:00Z")).toBe("2026-09-12 Meeting.md");
  });

  it("says undated rather than inventing a date", () => {
    expect(fileNameFor("Standup", "not a date")).toBe("undated Standup.md");
  });

  it("bounds a very long title", () => {
    const name = fileNameFor("x".repeat(300), "2026-09-12T00:00:00Z");
    expect(name.length).toBeLessThanOrEqual(11 + 90 + 3);
    expect(name.endsWith(".md")).toBe(true);
  });
});
