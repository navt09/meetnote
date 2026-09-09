import "server-only";
import { RECORDINGS_BUCKET, supabaseAdmin } from "./supabase-admin";
import { normalizeUtterances, type DeepgramUtterance } from "./transcript";
import { transcriptionCostUsd } from "./cost";
import { HttpError, withRetry } from "./retry";
import { extractNotes } from "./extract";
import { nextStep, type Meeting } from "./meeting";
import type { TranscriptSegment } from "./schema";

export type TranscribeResult = { segments: TranscriptSegment[]; durationSeconds: number; costUsd: number };

/** Transcribes an object already in the recordings bucket. Deepgram fetches it by signed link. */
export async function transcribeFromStorage(path: string): Promise<TranscribeResult> {
  const key = process.env.DEEPGRAM_API_KEY;
  if (!key) throw new Error("DEEPGRAM_API_KEY is not set");

  const admin = supabaseAdmin();
  const { data, error } = await admin.storage.from(RECORDINGS_BUCKET).createSignedUrl(path, 3600);
  if (error || !data) throw new Error(`Recording not found in storage: ${error?.message ?? path}`);

  const params = new URLSearchParams({
    model: "nova-3",
    smart_format: "true",
    punctuate: "true",
    diarize: "true",
    utterances: "true",
  });

  type DeepgramResponse = { metadata?: { duration?: number }; results?: { utterances?: DeepgramUtterance[] } };

  const res = await withRetry(
    async () => {
      const r = await fetch(`https://api.deepgram.com/v1/listen?${params}`, {
        method: "POST",
        headers: { Authorization: `Token ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ url: data.signedUrl }),
        signal: AbortSignal.timeout(270_000),
      });
      if (!r.ok) {
        const text = await r.text().catch(() => "");
        throw new HttpError(r.status, `Deepgram ${r.status}: ${text.slice(0, 300)}`);
      }
      return (await r.json()) as DeepgramResponse;
    },
    { attempts: 3, baseMs: 1500 },
  );

  const segments = normalizeUtterances(res.results?.utterances ?? []);
  const durationSeconds = res.metadata?.duration ?? 0;
  const costUsd = transcriptionCostUsd(durationSeconds);
  console.log(JSON.stringify({ event: "transcribe", path, durationSeconds, segments: segments.length, costUsd }));
  return { segments, durationSeconds, costUsd };
}

/** How long an in-progress status may sit before we assume the worker died. */
const STALE_MS = 6 * 60 * 1000;

/**
 * Drives a meeting from wherever it is to "done", writing progress to the row
 * as it goes. Safe to call again after a failure: finished steps are skipped.
 * Uses the service role because it may run after the HTTP response is sent;
 * ownership was already checked by the caller, and we re-check user_id here.
 */
export async function runPipeline(meetingId: string, userId: string): Promise<void> {
  const admin = supabaseAdmin();

  const { data: row, error } = await admin.from("meetings").select("*").eq("id", meetingId).eq("user_id", userId).single();
  if (error || !row) {
    console.error(JSON.stringify({ event: "pipeline_missing", meetingId }));
    return;
  }
  const m = row as Meeting;

  // Don't start a second worker on a row another one is actively processing.
  if ((m.status === "transcribing" || m.status === "extracting") && Date.now() - new Date(m.updated_at).getTime() < STALE_MS) {
    console.log(JSON.stringify({ event: "pipeline_skip_busy", meetingId, status: m.status }));
    return;
  }

  const patch = async (fields: Partial<Meeting>) => {
    const { error: e } = await admin.from("meetings").update(fields).eq("id", meetingId).eq("user_id", userId);
    if (e) throw new Error(`Could not update meeting: ${e.message}`);
  };

  let transcript = m.transcript;
  let step = nextStep(m);
  try {
    if (step === "none") {
      if (!m.storage_path) throw new Error("No recording uploaded for this meeting.");
      if (m.notes) await patch({ status: "done", error: null });
      return;
    }

    if (step === "transcribe") {
      await patch({ status: "transcribing", error: null });
      const t = await transcribeFromStorage(m.storage_path!);
      transcript = t.segments;
      await patch({
        transcript: t.segments,
        duration_seconds: t.durationSeconds || m.duration_seconds,
        transcription_cost_usd: t.costUsd,
        status: "transcribed",
      });
      if (t.segments.length === 0) {
        await patch({ status: "error", error: "No speech was detected in the recording." });
        return;
      }
      step = "extract";
    }

    if (step === "extract") {
      await patch({ status: "extracting", error: null });
      const e = await extractNotes(transcript!);
      const keepTitle = !m.title.startsWith("Meeting · ") ? m.title : e.notes.title;
      await patch({
        notes: e.notes,
        usage: e.usage,
        llm_cost_usd: e.costUsd,
        title: keepTitle,
        status: "done",
        error: null,
      });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Processing failed";
    console.error(JSON.stringify({ event: "pipeline_error", meetingId, step, message }));
    await patch({ status: "error", error: message }).catch(() => {});
  }
}
