import { NextResponse, after } from "next/server";
import { isBlocked, requireSignedIn } from "@/lib/guard";
import { storedObjectSize } from "@/lib/storage";
import { runPipeline } from "@/lib/pipeline";
import { isInProgress, nextStep, processingAllowed, type Meeting } from "@/lib/meeting";

export const runtime = "nodejs";
export const maxDuration = 300;

type Ctx = { params: Promise<{ id: string }> };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * Kick off (or resume) transcription + extraction for a meeting whose audio
 * is in storage. Responds immediately; the work continues after the response
 * and writes progress to the row, so the browser can close.
 */
export async function POST(req: Request, ctx: Ctx) {
  const gate = await requireSignedIn(req);
  if (isBlocked(gate)) return gate;
  const { auth } = gate;
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const { data, error } = await auth.db.from("meetings").select("*").eq("id", id).maybeSingle();
  if (error) {
    console.error(JSON.stringify({ event: "process_lookup_error", id, message: error.message }));
    return NextResponse.json({ error: "Could not start processing." }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
  const m = data as Meeting;

  if (isInProgress(m.status) && Date.now() - new Date(m.updated_at).getTime() < 6 * 60 * 1000) {
    return NextResponse.json({ status: m.status }, { status: 202 });
  }
  if (nextStep(m) === "none" && m.notes) return NextResponse.json({ status: "done" }, { status: 200 });

  // Checked here so the browser is told, and again in the pipeline because
  // that is what actually spends the money. Not a usage limit: it counts
  // attempts at one meeting, which only repeat because of a bug or an attack.
  const allowed = processingAllowed(m.process_attempts ?? 0);
  if (!allowed.ok) {
    console.error(JSON.stringify({ event: "process_attempts_exceeded", id, attempts: m.process_attempts }));
    return NextResponse.json({ error: allowed.reason }, { status: 429 });
  }
  if (!m.storage_path) return NextResponse.json({ error: "This meeting has no audio." }, { status: 409 });

  // Make sure the upload actually landed before we spend money on it.
  let size: number | null;
  try {
    size = await storedObjectSize(m.storage_path);
  } catch (err) {
    console.error(JSON.stringify({ event: "storage_check_error", id, message: err instanceof Error ? err.message : String(err) }));
    return NextResponse.json({ error: "Couldn't reach the stored audio. Try again in a minute." }, { status: 502 });
  }
  if (size === null) return NextResponse.json({ error: "The audio didn't finish uploading." }, { status: 409 });

  await auth.db
    .from("meetings")
    .update({
      status: m.transcript?.length ? "transcribed" : "uploaded",
      error: null,
      // Counted before the work starts, not after it succeeds: a loop that
      // crashes every time would never reach an increment written at the end.
      process_attempts: (m.process_attempts ?? 0) + 1,
      ...(size ? { bytes: size } : {}),
    })
    .eq("id", id);

  after(async () => {
    await runPipeline(id, auth.user.id);
  });

  return NextResponse.json({ status: "queued" }, { status: 202 });
}
