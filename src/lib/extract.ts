import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { MeetingNotes, type TranscriptSegment } from "./schema";
import { formatTimestamp } from "./transcript";
import { llmCostUsd, type LlmUsage } from "./cost";

export const EXTRACT_MODEL = "claude-sonnet-5";

const SYSTEM = `You turn meeting transcripts into structured notes for an engineering team.
Be concrete. Every action item must be something a person can actually do; write titles the way a good engineer writes a ticket title.
Attribute owners only when the transcript makes it clear who took the task. Never invent names, dates, or details.
If speakers are labeled generically (Speaker 0, Speaker 1), keep those labels rather than guessing names.
Never assume anyone's pronouns. Refer to people by name, or use they/them if a pronoun is unavoidable.
If the transcript contains no real meeting content (silence, music, a single test sentence), still fill the schema honestly: a short title, a one-line summary saying so, and empty lists.
For each action item, "quote" is the line from the transcript that the task came from, copied word for word, at most about 200 characters. Never paraphrase it, tidy it up or write words nobody said; use null when no single line carries the task.
For each action item, "first_step" is one short sentence saying where the person should start, drawn only from what the meeting actually discussed. It is a suggestion, not a decision. If the meeting gave no basis for a first step, use null rather than inventing one.`;

/**
 * The "for you" section is the same call, told who the reader is. The label on
 * their lines was set from their microphone by tagSelf, not by the model, so
 * "committed" rests on things they demonstrably said.
 */
function forYouInstructions(label: string): string {
  return `

One participant is the person these notes are for. In the transcript their lines are labeled "${label}". That label was set from their microphone, not guessed, so treat those lines as things they actually said.
Fill the "for_you" section from two sources only: what was said under that label, and what other speakers said to or about them by name. Write each entry as one short line a person can act on.
When nothing qualifies, leave the list empty. Never pad it, and never guess what they might have wanted.`;
}

export type ExtractResult = {
  notes: MeetingNotes;
  usage: LlmUsage;
  costUsd: number;
  model: string;
};

/**
 * Reasoning effort, typed from the SDK so a level the API drops or renames
 * fails to compile rather than at runtime. Reasoning is billed as output, and
 * output is 5x input on Sonnet, so this is the biggest lever on extraction
 * cost.
 */
export type Effort = NonNullable<Anthropic.Messages.OutputConfig["effort"]>;

/**
 * Named rather than left to the model's default, because a default is not a
 * decision: it can move under us, and extraction is the call whose output we
 * cannot check by eye.
 *
 * Measured with `npm run compare:effort` before it was set. Low saved nothing
 * on two real transcripts, using more output tokens than medium on one of
 * them, and left the owner blank on every action item of the other where
 * medium attributed each one. An unowned task is most of the way to a useless
 * one, so the saving was not real and the loss was.
 */
export const EXTRACT_EFFORT: Effort = "medium";

export async function extractNotes(
  segments: TranscriptSegment[],
  // `effort: null` means send no effort at all, which is only used by the
  // comparison harness to measure this decision against the model's default.
  opts: { name?: string | null; effort?: Effort | null } = {},
): Promise<ExtractResult> {
  const client = new Anthropic();
  const label = opts.name ?? "You";
  const effort = opts.effort === undefined ? EXTRACT_EFFORT : opts.effort;

  const transcript = segments.map((s) => `[${formatTimestamp(s.start)}] ${s.speaker}: ${s.text}`).join("\n");

  // Streaming keeps the connection alive for long transcripts; we still wait
  // for the whole message before parsing, because the output is one JSON object.
  const stream = client.messages.stream({
    model: EXTRACT_MODEL,
    max_tokens: 32000,
    system: SYSTEM + forYouInstructions(label),
    messages: [
      {
        role: "user",
        content: `Here is the transcript of a meeting. Produce the structured notes.\n\n<transcript>\n${transcript}\n</transcript>`,
      },
    ],
    // Spread rather than a plain key: an explicit null has to leave the key
    // out entirely, not send `effort: null`.
    output_config: { format: zodOutputFormat(MeetingNotes), ...(effort ? { effort } : {}) },
  });

  const message = await stream.finalMessage();

  if (message.stop_reason === "refusal") {
    throw new Error("The model declined to process this transcript.");
  }
  if (message.stop_reason === "max_tokens") {
    throw new Error("The transcript is too long to summarize in one pass. Try a shorter recording.");
  }

  const text = message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(text);
  } catch {
    throw new Error("The model returned malformed notes. Please retry.");
  }
  const result = MeetingNotes.safeParse(parsedJson);
  if (!result.success) {
    throw new Error(`Notes did not match the expected shape: ${result.error.issues[0]?.message ?? "unknown"}`);
  }

  const usage: LlmUsage = {
    input_tokens: message.usage.input_tokens,
    output_tokens: message.usage.output_tokens,
    cache_read_input_tokens: message.usage.cache_read_input_tokens,
    cache_creation_input_tokens: message.usage.cache_creation_input_tokens,
  };
  const costUsd = llmCostUsd(usage, EXTRACT_MODEL);

  console.log(JSON.stringify({ event: "extract", model: EXTRACT_MODEL, segments: segments.length, usage, costUsd }));

  return { notes: result.data, usage, costUsd, model: EXTRACT_MODEL };
}
