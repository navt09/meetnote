// A deliberately tiny Markdown reader for previewing drafts.
//
// The stored draft keeps its Markdown, because that is what Linear, Jira and
// GitHub expect when it is pasted in. This only parses enough to show it
// nicely: paragraphs, bullet lists, and **bold**.
//
// It returns data, never HTML, so model output can never inject markup.

export type Inline = { text: string; bold: boolean };
export type Block = { type: "paragraph"; content: Inline[] } | { type: "bullets"; items: Inline[][] };

/** Splits a line into bold and plain runs. Unmatched ** is left as text. */
export function parseInline(line: string): Inline[] {
  const out: Inline[] = [];
  let rest = line;
  while (rest.length > 0) {
    const open = rest.indexOf("**");
    if (open === -1) {
      out.push({ text: rest, bold: false });
      break;
    }
    const close = rest.indexOf("**", open + 2);
    if (close === -1) {
      out.push({ text: rest, bold: false });
      break;
    }
    if (open > 0) out.push({ text: rest.slice(0, open), bold: false });
    const inner = rest.slice(open + 2, close);
    if (inner.length > 0) out.push({ text: inner, bold: true });
    rest = rest.slice(close + 2);
  }
  return out.filter((r) => r.text.length > 0);
}

const BULLET = /^\s*[-*]\s+/;

export function parseBlocks(markdown: string): Block[] {
  const blocks: Block[] = [];
  const chunks = (markdown ?? "").replace(/\r\n/g, "\n").split(/\n{2,}/);

  for (const chunk of chunks) {
    const lines = chunk.split("\n").filter((l) => l.trim().length > 0);
    if (lines.length === 0) continue;

    if (lines.every((l) => BULLET.test(l))) {
      blocks.push({ type: "bullets", items: lines.map((l) => parseInline(l.replace(BULLET, ""))) });
      continue;
    }

    // A run of bullets after some prose: emit the prose, then the bullets.
    const firstBullet = lines.findIndex((l) => BULLET.test(l));
    if (firstBullet > 0) {
      blocks.push({ type: "paragraph", content: parseInline(lines.slice(0, firstBullet).join(" ")) });
      blocks.push({ type: "bullets", items: lines.slice(firstBullet).map((l) => parseInline(l.replace(BULLET, ""))) });
      continue;
    }

    // Drop leading "#" so a heading reads as a bold line rather than "## Thing".
    blocks.push({ type: "paragraph", content: parseInline(lines.join(" ").replace(/^#{1,6}\s+/, "")) });
  }
  return blocks;
}
