import { z } from "zod";

export const ActionItem = z.object({
  title: z.string().describe("Short imperative title, like a ticket title"),
  details: z.string().describe("What was actually said about it, 1-3 sentences"),
  owner: z.string().nullable().describe("Person who volunteered or was assigned, or null"),
  due: z.string().nullable().describe("Due date or timeframe if mentioned, else null"),
  priority: z.enum(["low", "medium", "high"]),
  kind: z.enum(["bug", "feature", "task", "follow_up", "other"]),
  // Both nullable, and both come out of the same extraction call that was
  // already reading the whole transcript, so neither costs a request.
  //
  // The quote is the trust anchor: it is how somebody checks the task was not
  // invented, which only works if it is verbatim. The first step is a
  // suggestion and is labelled as one wherever it is shown. Null is a real
  // answer for either, and notes written before this existed simply have
  // neither.
  quote: z
    .string()
    .nullable()
    .describe("The words from the transcript that produced this task, verbatim, at most ~200 characters, or null"),
  first_step: z
    .string()
    .nullable()
    .describe("One short sentence on where to start, grounded in what was discussed, or null"),
  // The one field that changes what a person does with a task rather than
  // describing it: work that is waiting on somebody else belongs on a chase
  // list, not on today's list. It records what the meeting said at the time
  // and is never updated afterwards, so it stays a quote of the meeting rather
  // than becoming stale project state.
  blocked_by: z
    .string()
    .nullable()
    .describe("What has to happen before this can start, in the meeting's own terms, or null if nothing was said to be in the way"),
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

/**
 * The part of the notes that is about the person who recorded the meeting.
 *
 * Their own lines in the transcript carry their name (or "You"), put there by
 * the microphone timeline rather than by the model, so "committed" is drawn
 * from things they demonstrably said. The other lists come from what other
 * speakers said to or about them by name. Every list may be empty; an empty
 * list is the honest answer when the meeting was not about them.
 */
export const ForYou = z.object({
  committed: z.array(z.string()).describe("Things this person said they would do, in their own words"),
  asked_of_you: z.array(z.string()).describe("Requests or questions other people directed at this person"),
  heads_up: z.array(z.string()).describe("Decisions or changes that affect this person's work"),
  mentioned: z.array(z.string()).describe("Where other people named this person, and why"),
});

export const MeetingNotes = z.object({
  title: z.string().describe("A short title for the meeting"),
  summary: z.string().describe("3-6 sentence overview"),
  key_points: z.array(z.string()),
  action_items: z.array(ActionItem),
  decisions: z.array(Decision),
  people_to_contact: z.array(Person),
  open_questions: z.array(z.string()),
  for_you: ForYou,
});

export type MeetingNotes = z.infer<typeof MeetingNotes>;
export type ActionItem = z.infer<typeof ActionItem>;
export type ForYou = z.infer<typeof ForYou>;

export type TranscriptSegment = {
  speaker: string;
  text: string;
  start: number;
  end: number;
};
