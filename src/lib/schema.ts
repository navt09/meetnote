import { z } from "zod";

export const ActionItem = z.object({
  title: z.string().describe("Short imperative title, like a ticket title"),
  details: z.string().describe("What was actually said about it, 1-3 sentences"),
  owner: z.string().nullable().describe("Person who volunteered or was assigned, or null"),
  due: z.string().nullable().describe("Due date or timeframe if mentioned, else null"),
  priority: z.enum(["low", "medium", "high"]),
  kind: z.enum(["bug", "feature", "task", "follow_up", "other"]),
});

export const Decision = z.object({
  decision: z.string(),
  context: z.string().describe("Why it was decided, briefly"),
});

export const Person = z.object({
  name: z.string(),
  role: z.string().nullable(),
  why: z.string().describe("Why they need to be contacted or what was said about them"),
});

export const MeetingNotes = z.object({
  title: z.string().describe("A short title for the meeting"),
  summary: z.string().describe("3-6 sentence overview"),
  key_points: z.array(z.string()),
  action_items: z.array(ActionItem),
  decisions: z.array(Decision),
  people_to_contact: z.array(Person),
  open_questions: z.array(z.string()),
});

export type MeetingNotes = z.infer<typeof MeetingNotes>;
export type ActionItem = z.infer<typeof ActionItem>;

export type TranscriptSegment = {
  speaker: string;
  text: string;
  start: number;
  end: number;
};
