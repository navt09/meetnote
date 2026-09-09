import type { MeetingNotes } from "./schema";

/** Plain-code export of notes to Markdown, for pasting into Slack, Notion, email. */
export function notesToMarkdown(n: MeetingNotes, meetingDate?: Date): string {
  const lines: string[] = [];
  lines.push(`# ${n.title}`);
  if (meetingDate) lines.push(`_${meetingDate.toLocaleString()}_`);
  lines.push("", n.summary, "");

  // The personal section goes first, as on screen. Older notes have no
  // for_you at all, so read it defensively rather than trusting the type.
  const fy = n.for_you as MeetingNotes["for_you"] | undefined;
  const personal: [string, string[]][] = fy
    ? [
        ["You said you would", fy.committed],
        ["Asked of you", fy.asked_of_you],
        ["Heads-up", fy.heads_up],
        ["You were mentioned", fy.mentioned],
      ]
    : [];
  if (personal.some(([, items]) => items.length > 0)) {
    lines.push("## For you");
    for (const [heading, items] of personal) {
      if (items.length === 0) continue;
      lines.push(`**${heading}**`);
      for (const item of items) lines.push(`- ${item}`);
      lines.push("");
    }
  }

  if (n.key_points.length) {
    lines.push("## Key points");
    for (const k of n.key_points) lines.push(`- ${k}`);
    lines.push("");
  }

  lines.push(`## Action items (${n.action_items.length})`);
  if (n.action_items.length === 0) lines.push("_None_");
  for (const a of n.action_items) {
    const meta = [a.owner ?? "unassigned", a.priority, a.kind, a.due ? `due ${a.due}` : null]
      .filter(Boolean)
      .join(" · ");
    lines.push(`- [ ] **${a.title}** (${meta})`);
    if (a.details) lines.push(`  ${a.details}`);
  }
  lines.push("");

  if (n.decisions.length) {
    lines.push("## Decisions");
    for (const d of n.decisions) lines.push(`- **${d.decision}** — ${d.context}`);
    lines.push("");
  }

  if (n.people_to_contact.length) {
    lines.push("## People to contact");
    for (const p of n.people_to_contact) {
      lines.push(`- **${p.name}**${p.role ? ` (${p.role})` : ""}: ${p.why}`);
    }
    lines.push("");
  }

  if (n.open_questions.length) {
    lines.push("## Open questions");
    for (const q of n.open_questions) lines.push(`- ${q}`);
    lines.push("");
  }

  return lines.join("\n").trimEnd() + "\n";
}
