import type { MeetingNotes, TranscriptSegment } from "./schema";
import type { LlmUsage } from "./cost";

export type MeetingStatus = "recorded" | "uploaded" | "transcribing" | "transcribed" | "extracting" | "done" | "error";

/** The full database row. Server-side only: it holds internal fields. */
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
  /** When the recorder's mic was the loud one: [start, end] seconds. Internal. */
  self_speech: [number, number][] | null;
  /** Which audio the browser actually captured. Diagnostic; internal. */
  sources: { system: boolean; mic: boolean } | null;
  usage: LlmUsage | null;
  transcription_cost_usd: number;
  llm_cost_usd: number;
  created_at: string;
  updated_at: string;
};

/** What the browser is allowed to see. No storage paths, ids, or vendor economics. */
export type PublicMeeting = {
  id: string;
  title: string;
  status: MeetingStatus;
  error: string | null;
  hasAudio: boolean;
  durationSeconds: number | null;
  recordedAt: string;
  transcript: TranscriptSegment[] | null;
  notes: MeetingNotes | null;
  /** Present only for owner accounts. */
  internal?: { costUsd: number; inputTokens: number; outputTokens: number };
};

export type PublicMeetingSummary = Pick<PublicMeeting, "id" | "title" | "status" | "error" | "durationSeconds" | "recordedAt"> & {
  internal?: { costUsd: number };
};

export function toPublicMeeting(m: Meeting, includeInternal = false): PublicMeeting {
  const out: PublicMeeting = {
    id: m.id,
    title: m.title,
    status: m.status,
    error: m.error,
    hasAudio: !!m.storage_path,
    durationSeconds: m.duration_seconds === null ? null : Number(m.duration_seconds),
    recordedAt: m.recorded_at,
    transcript: m.transcript,
    notes: m.notes,
  };
  if (includeInternal) {
    out.internal = {
      costUsd: Number(m.transcription_cost_usd ?? 0) + Number(m.llm_cost_usd ?? 0),
      inputTokens: m.usage?.input_tokens ?? 0,
      outputTokens: m.usage?.output_tokens ?? 0,
    };
  }
  return out;
}

export function toPublicSummary(
  m: Pick<Meeting, "id" | "title" | "status" | "error" | "duration_seconds" | "recorded_at" | "transcription_cost_usd" | "llm_cost_usd">,
  includeInternal = false,
): PublicMeetingSummary {
  const out: PublicMeetingSummary = {
    id: m.id,
    title: m.title,
    status: m.status,
    error: m.error,
    durationSeconds: m.duration_seconds === null ? null : Number(m.duration_seconds),
    recordedAt: m.recorded_at,
  };
  if (includeInternal) out.internal = { costUsd: Number(m.transcription_cost_usd ?? 0) + Number(m.llm_cost_usd ?? 0) };
  return out;
}

export const IN_PROGRESS: ReadonlySet<MeetingStatus> = new Set(["transcribing", "extracting"]);

export function isInProgress(status: MeetingStatus): boolean {
  return IN_PROGRESS.has(status);
}

/** True while the pipeline still has work to do, so the page should keep polling. */
export function isSettling(status: MeetingStatus): boolean {
  return isInProgress(status) || status === "uploaded" || status === "transcribed";
}

/**
 * Where to (re)start the pipeline from, given what the row already has.
 * Plain rules, so a retry never redoes finished work.
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
      return "Ready";
    case "error":
      return "Needs attention";
  }
}

/** 0 to 1, for the progress bar while a meeting is processing. */
export function statusProgress(s: MeetingStatus): number {
  switch (s) {
    case "recorded":
      return 0;
    case "uploaded":
      return 0.2;
    case "transcribing":
      return 0.45;
    case "transcribed":
      return 0.7;
    case "extracting":
      return 0.85;
    case "done":
      return 1;
    case "error":
      return 1;
  }
}

/** Sensible title before the notes exist: "Meeting · Tue 8 Sep, 4:30 PM". */
export function defaultTitle(recordedAt: Date): string {
  const d = recordedAt.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
  const t = recordedAt.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return `Meeting · ${d}, ${t}`;
}
