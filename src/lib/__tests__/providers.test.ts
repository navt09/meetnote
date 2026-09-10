import { describe, expect, it } from "vitest";
import { markdownToAdf } from "../providers/jira";
import { escapeMrkdwn, markdownToMrkdwn } from "../providers/slack";
import { isValidSlackWebhook, normaliseJiraSite } from "../connectors";

describe("markdownToAdf", () => {
  it("wraps everything in a versioned doc", () => {
    const doc = markdownToAdf("Hello.");
    expect(doc.version).toBe(1);
    expect(doc.type).toBe("doc");
  });

  it("makes each paragraph its own top-level node", () => {
    const doc = markdownToAdf("First.\n\nSecond.");
    expect(doc.content).toHaveLength(2);
    expect(doc.content.every((b) => b.type === "paragraph")).toBe(true);
  });

  it("puts bold on the text node as a strong mark, splitting the sentence", () => {
    const doc = markdownToAdf("plain **bold** plain");
    const para = doc.content[0] as { content: { text: string; marks?: { type: string }[] }[] };
    expect(para.content).toHaveLength(3);
    expect(para.content[1]).toEqual({ type: "text", text: "bold", marks: [{ type: "strong" }] });
    expect(para.content[0].marks).toBeUndefined();
  });

  it("nests bullets as listItem then paragraph, which Jira requires", () => {
    const doc = markdownToAdf("- one\n- two");
    const list = doc.content[0] as { type: string; content: { type: string; content: { type: string }[] }[] };
    expect(list.type).toBe("bulletList");
    expect(list.content).toHaveLength(2);
    expect(list.content[0].type).toBe("listItem");
    expect(list.content[0].content[0].type).toBe("paragraph");
  });

  it("never emits an empty text node", () => {
    const doc = markdownToAdf("**bold**\n\n\n\nafter");
    const texts = JSON.stringify(doc);
    expect(texts).not.toContain('"text":""');
  });

  it("gives an empty input a valid document rather than an empty one", () => {
    const doc = markdownToAdf("");
    expect(doc.content).toHaveLength(1);
    expect(doc.content[0]).toEqual({ type: "paragraph" });
  });

  it("handles the shape the agent actually writes", () => {
    const doc = markdownToAdf("**Context**\n\nIt crashes.\n\n**What to do**\n\n- Reproduce it.\n- Fix it.");
    expect(doc.content.map((b) => b.type)).toEqual(["paragraph", "paragraph", "paragraph", "bulletList"]);
  });
});

describe("markdownToMrkdwn", () => {
  it("uses one asterisk for bold, not two", () => {
    expect(markdownToMrkdwn("**bold**")).toBe("*bold*");
  });

  it("keeps paragraphs apart", () => {
    expect(markdownToMrkdwn("One.\n\nTwo.")).toBe("One.\n\nTwo.");
  });

  it("renders bullets with a bullet character", () => {
    expect(markdownToMrkdwn("- one\n- two")).toBe("• one\n• two");
  });
});

describe("escapeMrkdwn", () => {
  it("escapes exactly the three characters Slack decodes", () => {
    expect(escapeMrkdwn("a & b < c > d")).toBe("a &amp; b &lt; c &gt; d");
  });

  it("stops transcript text from forging a channel-wide mention", () => {
    expect(escapeMrkdwn("<!channel>")).toBe("&lt;!channel&gt;");
    expect(markdownToMrkdwn("Someone said <!here> in the meeting")).not.toContain("<!here>");
  });

  it("leaves quotes and apostrophes alone", () => {
    expect(escapeMrkdwn(`it's "fine"`)).toBe(`it's "fine"`);
  });
});

describe("normaliseJiraSite", () => {
  it("accepts a bare host and adds https", () => {
    expect(normaliseJiraSite("acme.atlassian.net")).toBe("https://acme.atlassian.net");
  });
  it("strips paths and trailing slashes", () => {
    expect(normaliseJiraSite("https://acme.atlassian.net/jira/software/")).toBe("https://acme.atlassian.net");
  });
  it("rejects nonsense", () => {
    for (const bad of ["", "   ", "acme", "not a url"]) expect(normaliseJiraSite(bad)).toBeNull();
  });
  it("refuses addresses that would point the server at its own network", () => {
    for (const bad of ["127.0.0.1", "http://10.0.0.5", "169.254.169.254", "localhost", "https://[::1]", "jira.internal.local"]) {
      expect(normaliseJiraSite(bad)).toBeNull();
    }
  });
});

describe("isValidSlackWebhook", () => {
  it("accepts a real webhook URL", () => {
    expect(isValidSlackWebhook("https://hooks.slack.com/services/T000/B000/xxxx")).toBe(true);
  });
  it("rejects other hosts, so this server can't be pointed at anything else", () => {
    for (const bad of [
      "https://evil.example.com/services/T000/B000/x",
      "http://hooks.slack.com/services/T000/B000/x",
      "https://hooks.slack.com/other/path",
      "not a url",
      "",
    ]) {
      expect(isValidSlackWebhook(bad)).toBe(false);
    }
  });
});
