import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { MeetingNotes, type TranscriptSegment } from "./schema";
import { formatTimestamp } from "./transcript";
import { llmCostUsd, type LlmUsage } from "./cost";

export const EXTRACT_MODEL = "claude-opus-5";

const SYSTEM = `You turn meeting transcripts into structured notes for an engineering team.
Be concrete. Every action item must be something a person can actually do; write titles the way a good engineer writes a ticket title.
Attribute owners only when the transcript makes it clear who took the task. Never invent names, dates, or details.
If speakers are labeled generically (Speaker 0, Speaker 1), keep those labels rather than guessing names.
Never assume anyone's pronouns. Refer to people by name, or use they/them if a pronoun is unavoidable.
If the transcript contains no real meeting content (silence, music, a single test sentence), still fill the schema honestly: a short title, a one-line summary saying so, and empty lists.`;

export type ExtractResult = {
  notes: MeetingNotes;
  usage: LlmUsage;
  costUsd: number;
  model: string;
};

export async function extractNotes(segments: TranscriptSegment[]): Promise<ExtractResult> {
  const client = new Anthropic();

  const transcript = segments.map((s) => `[${formatTimestamp(s.start)}] ${s.speaker}: ${s.text}`).join("\n");

  // Streaming keeps the connection alive for long transcripts; we still wait
  // for the whole message before parsing, because the output is one JSON object.
  const stream = client.messages.stream({
    model: EXTRACT_MODEL,
    max_tokens: 32000,
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: `Here is the transcript of a meeting. Produce the structured notes.\n\n<transcript>\n${transcript}\n</transcript>`,
      },
    ],
    output_config: { format: zodOutputFormat(MeetingNotes) },
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
  const costUsd = llmCostUsd(usage);

  console.log(JSON.stringify({ event: "extract", model: EXTRACT_MODEL, segments: segments.length, usage, costUsd }));

  return { notes: result.data, usage, costUsd, model: EXTRACT_MODEL };
}
