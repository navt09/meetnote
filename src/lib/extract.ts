import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { MeetingNotes, type TranscriptSegment } from "./schema";

const SYSTEM = `You turn meeting transcripts into structured notes for an engineering team.
Be concrete. Every action item must be something a person can actually do; write titles the way a good engineer writes a ticket title.
Attribute owners only when the transcript makes it clear who took the task. Never invent names, dates, or details.
If speakers are labeled generically (Speaker 0, Speaker 1), keep those labels rather than guessing names.
Never assume anyone's pronouns. Refer to people by name, or use they/them if a pronoun is unavoidable.`;

export async function extractNotes(segments: TranscriptSegment[]): Promise<MeetingNotes> {
  const client = new Anthropic();

  const transcript = segments
    .map((s) => `[${fmt(s.start)}] ${s.speaker}: ${s.text}`)
    .join("\n");

  const response = await client.messages.parse({
    model: "claude-opus-5",
    max_tokens: 16000,
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: `Here is the transcript of a meeting. Produce the structured notes.\n\n<transcript>\n${transcript}\n</transcript>`,
      },
    ],
    output_config: { format: zodOutputFormat(MeetingNotes) },
  });

  if (response.stop_reason === "refusal") {
    throw new Error("The model declined to process this transcript.");
  }
  if (!response.parsed_output) {
    throw new Error("Could not parse structured notes from the model response.");
  }
  return response.parsed_output;
}

function fmt(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
