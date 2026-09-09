import { describe, expect, it } from "vitest";
import { parseBlocks, parseInline } from "../markdown-lite";

describe("parseInline", () => {
  it("splits bold runs out of plain text", () => {
    expect(parseInline("a **b** c")).toEqual([
      { text: "a ", bold: false },
      { text: "b", bold: true },
      { text: " c", bold: false },
    ]);
  });
  it("handles a whole line being bold", () => {
    expect(parseInline("**Context**")).toEqual([{ text: "Context", bold: true }]);
  });
  it("leaves an unmatched marker as literal text", () => {
    expect(parseInline("2 ** 3 = 8")).toEqual([{ text: "2 ** 3 = 8", bold: false }]);
  });
  it("handles several bold runs", () => {
    expect(parseInline("**a** and **b**")).toEqual([
      { text: "a", bold: true },
      { text: " and ", bold: false },
      { text: "b", bold: true },
    ]);
  });
  it("returns nothing for an empty line", () => {
    expect(parseInline("")).toEqual([]);
  });
});

describe("parseBlocks", () => {
  it("separates paragraphs on blank lines", () => {
    const b = parseBlocks("First para.\n\nSecond para.");
    expect(b).toHaveLength(2);
    expect(b[0]).toEqual({ type: "paragraph", content: [{ text: "First para.", bold: false }] });
  });

  it("reads a bullet list", () => {
    const b = parseBlocks("- one\n- two");
    expect(b).toEqual([{ type: "bullets", items: [[{ text: "one", bold: false }], [{ text: "two", bold: false }]] }]);
  });

  it("accepts asterisk bullets too", () => {
    expect(parseBlocks("* one")[0].type).toBe("bullets");
  });

  it("splits prose followed by bullets into two blocks", () => {
    const b = parseBlocks("Do these:\n- one\n- two");
    expect(b.map((x) => x.type)).toEqual(["paragraph", "bullets"]);
  });

  it("turns a heading into a plain line", () => {
    expect(parseBlocks("## What to do")).toEqual([{ type: "paragraph", content: [{ text: "What to do", bold: false }] }]);
  });

  it("handles the shape the agent actually produces", () => {
    const b = parseBlocks("**Context**\n\nIt crashes.\n\n**What to do**\n\n- Reproduce it.\n- Fix it.");
    expect(b.map((x) => x.type)).toEqual(["paragraph", "paragraph", "paragraph", "bullets"]);
    expect(b[0]).toEqual({ type: "paragraph", content: [{ text: "Context", bold: true }] });
  });

  it("copes with empty and whitespace input", () => {
    expect(parseBlocks("")).toEqual([]);
    expect(parseBlocks("\n\n  \n")).toEqual([]);
  });

  it("normalises Windows line endings", () => {
    expect(parseBlocks("a\r\n\r\nb")).toHaveLength(2);
  });
});
