import type { MeetingNotes, TranscriptSegment } from "./schema";
import type { LlmUsage } from "./cost";

export type MeetingStatus = "recorded" | "uploaded" | "transcribing" | "transcribed" | "extracting" | "done" | "error";

export type Meeting = {
  id: string;
  user_id: string;
  title: string;
  status: MeetingStatus;
  error: string | null;
  storage_path: string | null;
  mime_type: string | null;
  bytes: number | null;
  duration_seconds: number | null;
  recorded_at: string;
  transcript: TranscriptSegment[] | null;
  notes: MeetingNotes | null;
  usage: LlmUsage | null;
  transcription_cost_usd: number;
  llm_cost_usd: number;
  created_at: string;
  updated_at: string;
};

/** Row shape the list page needs; keeps the big JSON columns out of the query. */
export type MeetingSummary = Pick<
  Meeting,
  "id" | "title" | "status" | "error" | "duration_seconds" | "recorded_at" | "transcription_cost_usd" | "llm_cost_usd"
>;

export const IN_PROGRESS: ReadonlySet<MeetingStatus> = new Set(["transcribing", "extracting"]);

export function isInProgress(status: MeetingStatus): boolean {
  return IN_PROGRESS.has(status);
}

/**
 * Where to (re)start the pipeline from, given what the row already has.
 * Plain rules, so a retry never redoes finished work:
 *  - no transcript yet  -> transcribe
 *  - transcript, no notes -> extract
 *  - notes present -> nothing to do
 */
export function nextStep(m: Pick<Meeting, "storage_path" | "transcript" | "notes">): "transcribe" | "extract" | "none" {
  if (m.notes) return "none";
  if (m.transcript && m.transcript.length > 0) return "extract";
  if (m.storage_path) return "transcribe";
  return "none";
}

export function statusLabel(s: MeetingStatus): string {
  switch (s) {
    case "recorded":
      return "Not uploaded";
    case "uploaded":
      return "Queued";
    case "transcribing":
      return "Transcribing";
    case "transcribed":
      return "Transcribed";
    case "extracting":
      return "Writing notes";
    case "done":
      return "Done";
    case "error":
      return "Needs attention";
  }
}

/** Sensible title before the notes exist: "Meeting · Tue 8 Sep, 4:30 PM". */
export function defaultTitle(recordedAt: Date): string {
  const d = recordedAt.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
  const t = recordedAt.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return `Meeting · ${d}, ${t}`;
}
