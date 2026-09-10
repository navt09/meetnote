import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { EmailDraft, TicketDraft } from "./draft";
import { formatTimestamp } from "./transcript";
import { llmCostUsd, type LlmUsage } from "./cost";
import type { ActionItem, MeetingNotes, TranscriptSegment } from "./schema";

export const DRAFT_MODEL = "claude-haiku-4-5";

/**
 * Drafting sends no effort at all, and must not.
 *
 * Low effort was the obvious saving here, for the same reason Haiku is: a
 * draft is a short rephrasing of notes we already have, read and approved by a
 * person before anything is sent. But claude-haiku-4-5 rejects the parameter
 * outright, with "This model does not support the effort parameter", and the
 * request 400s. The SDK's types accept it, so nothing but a real call catches
 * this; the end-to-end run did. If drafting ever moves to a model that
 * supports effort, low is the level to ask for.
 */

/** The cap on the optional note a sender adds to an email draft. */
export const DRAFT_NOTE_MAX = 500;

/**
 * Trims and bounds the sender's optional note. Returns null for empty or for
 * anything that isn't a string, which means "draft it the way we always did".
 * Runs of whitespace collapse so a pasted block arrives as one paragraph.
 */
export function cleanDraftNote(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const cleaned = input.replace(/\s+/g, " ").trim().slice(0, DRAFT_NOTE_MAX).trim();
  return cleaned.length > 0 ? cleaned : null;
}

/**
 * The one place the model writes something a person might send. It only
 * rephrases what was already said; our code decides where anything goes, and
 * a person approves it first.
 */
const SHARED_RULES = `You write follow-up work from a meeting that already happened.
Use only what the transcript and notes actually say. Never invent a name, a date, a number, a system, a decision or a requirement.
If something needed is missing, say so plainly in the text rather than guessing.
Never assume anyone's pronouns; use their name, or they/them.
Write like a competent colleague: direct, concrete, no filler, no marketing tone, no exclamation marks.`;

const TICKET_SYSTEM = `${SHARED_RULES}

Write one engineering ticket.
The title is imperative and specific, the way a good engineer titles a ticket. No ticket-number prefixes.
The body is Markdown with three short sections in this order:
**Context** — what was said in the meeting that led to this, including who raised it.
**What to do** — the actual work, as concretely as the transcript supports.
**Done when** — how someone would know it is finished. If the transcript does not support acceptance criteria, write a single line saying the criteria need confirming and what is unclear.
If the action item names something it is blocked by, say so in one line at the top of Context, before anything else.
Keep the whole body under 200 words. Do not repeat the title as a heading.`;

const EMAIL_SYSTEM = `${SHARED_RULES}

Write one short follow-up email to the named person about what the meeting said to raise with them.
The subject is specific and under 70 characters.
The body is plain text, no Markdown, three short paragraphs at most: why you are writing, what you need from them, and what happens next.
Open with their first name. End the body with "Thanks," as the final line and nothing after it — the sign-off name is added afterward, not by you.
Under 120 words.`;

export type DraftResult<T> = { draft: T; usage: LlmUsage; costUsd: number; model: string };

function transcriptExcerpt(segments: TranscriptSegment[] | null, limit = 12000): string {
  if (!segments?.length) return "(no transcript available)";
  const text = segments.map((s) => `[${formatTimestamp(s.start)}] ${s.speaker}: ${s.text}`).join("\n");
  return text.length <= limit ? text : `${text.slice(0, limit)}\n…(transcript truncated)`;
}

async function run<T>(system: string, prompt: string, schema: Parameters<typeof zodOutputFormat>[0]): Promise<DraftResult<T>> {
  const client = new Anthropic();
  const response = await client.messages.parse({
    model: DRAFT_MODEL,
    max_tokens: 8000,
    system,
    messages: [{ role: "user", content: prompt }],
    output_config: { format: zodOutputFormat(schema) },
  });

  if (response.stop_reason === "refusal") throw new Error("The model declined to draft this.");
  if (!response.parsed_output) throw new Error("The model returned a draft we couldn't read. Try again.");

  const usage: LlmUsage = {
    input_tokens: response.usage.input_tokens,
    output_tokens: response.usage.output_tokens,
    cache_read_input_tokens: response.usage.cache_read_input_tokens,
    cache_creation_input_tokens: response.usage.cache_creation_input_tokens,
  };
  const costUsd = llmCostUsd(usage, DRAFT_MODEL);
  console.log(JSON.stringify({ event: "draft", model: DRAFT_MODEL, usage, costUsd }));
  return { draft: response.parsed_output as T, usage, costUsd, model: DRAFT_MODEL };
}

/** Turns one action item into a ticket, using the meeting for context. */
export async function draftTicket(
  task: Pick<ActionItem, "title" | "details" | "owner" | "due" | "priority" | "kind" | "blocked_by">,
  notes: MeetingNotes | null,
  transcript: TranscriptSegment[] | null,
  meetingTitle: string,
): Promise<DraftResult<TicketDraft>> {
  const prompt = [
    `<meeting title="${meetingTitle}">`,
    notes?.summary ? `<summary>\n${notes.summary}\n</summary>` : "",
    `<transcript>\n${transcriptExcerpt(transcript)}\n</transcript>`,
    "</meeting>",
    "",
    "<action_item>",
    `title: ${task.title}`,
    `details: ${task.details || "(none captured)"}`,
    `owner: ${task.owner ?? "unassigned"}`,
    `due: ${task.due ?? "not stated"}`,
    // A ticket that does not say what it is waiting on gets picked up and put
    // straight back down. The meeting already said it, so pass it through.
    task.blocked_by ? `blocked by: ${task.blocked_by}` : "",
    `type: ${task.kind}`,
    `priority: ${task.priority}`,
    "</action_item>",
    "",
    "Write the ticket for that action item.",
  ]
    .filter(Boolean)
    .join("\n");

  return run<TicketDraft>(TICKET_SYSTEM, prompt, TicketDraft);
}

/**
 * Turns a "person to contact" into a follow-up email.
 *
 * The sign-off name is not the model's to invent: it doesn't know who is
 * sending this. The prompt has it stop after "Thanks," and this function
 * appends the real name in code, from the account's own display name — the
 * same one self-speech labelling uses. With no name set, the email is left
 * signed with just "Thanks," rather than a guessed or placeholder name.
 */
export async function draftEmail(
  person: { name: string; role: string | null; why: string },
  notes: MeetingNotes | null,
  transcript: TranscriptSegment[] | null,
  meetingTitle: string,
  senderName: string | null,
  senderNote?: string | null,
): Promise<DraftResult<EmailDraft>> {
  // The note is the sender's own steer, not a source of facts. It is fenced in
  // its own tag and explicitly subordinated to the no-inventing rule, so that a
  // point the meeting never covered cannot arrive in the email as though it did.
  const noteBlock = senderNote
    ? [
        "<sender_notes>",
        senderNote,
        "</sender_notes>",
        "Those are points the sender wants covered. Work in the ones that fit what the meeting actually covered, and leave out the ones that do not.",
        "They do not override the rule above: never state as fact anything the meeting did not establish.",
        "",
      ].join("\n")
    : "";

  const prompt = [
    `<meeting title="${meetingTitle}">`,
    notes?.summary ? `<summary>\n${notes.summary}\n</summary>` : "",
    `<transcript>\n${transcriptExcerpt(transcript)}\n</transcript>`,
    "</meeting>",
    "",
    "<person>",
    `name: ${person.name}`,
    `role: ${person.role ?? "not stated"}`,
    `why they came up: ${person.why}`,
    "</person>",
    "",
    noteBlock,
    `Write the follow-up email to ${person.name}.`,
  ]
    .filter(Boolean)
    .join("\n");

  const result = await run<EmailDraft>(EMAIL_SYSTEM, prompt, EmailDraft);
  if (senderName) {
    result.draft.body = `${result.draft.body.trimEnd()}\n${senderName}`;
  }
  return result;
}
