import { NextResponse } from "next/server";
import { isBlocked, requireConnections } from "@/lib/guard";
import { loadConnector, noteConnectorError } from "@/lib/connector-store";
import { appendTasks } from "@/lib/providers/excel";
import { MicrosoftReconnectError } from "@/lib/providers/microsoft";
import { tasksToRows } from "@/lib/excel-rows";
import { sortTasks, toPublicTask, type TaskRow } from "@/lib/task";
import type { MicrosoftConfig, MicrosoftCredentials } from "@/lib/connectors";

export const runtime = "nodejs";
export const maxDuration = 60;

type Ctx = { params: Promise<{ id: string }> };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * Appends this meeting's tasks to the chosen Excel workbook.
 *
 * A share rather than a draft, for the same reason posting notes to Slack is:
 * these are the rows the person is already looking at, copied into their own
 * spreadsheet unchanged. Approval exists for text a model wrote that somebody
 * else will read as the user's words, and there is none of that here.
 *
 * Deliberately repeatable. A register is a running list, and refusing a second
 * press would mean tracking what had already been written and getting it wrong
 * the first time somebody deleted a row by hand.
 */
export async function POST(req: Request, ctx: Ctx) {
  const gate = await requireConnections(req);
  if (isBlocked(gate)) return gate;
  const { auth } = gate;

  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const [meetingRes, tasksRes] = await Promise.all([
    auth.db.from("meetings").select("id,title,recorded_at").eq("id", id).maybeSingle(),
    auth.db.from("tasks").select("*").eq("meeting_id", id),
  ]);

  if (meetingRes.error) {
    console.error(JSON.stringify({ event: "excel_lookup_error", id, message: meetingRes.error.message }));
    return NextResponse.json({ error: "Could not load that meeting." }, { status: 500 });
  }
  if (!meetingRes.data) return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
  const meeting = meetingRes.data as { id: string; title: string; recorded_at: string };

  const tasks = sortTasks(((tasksRes.data ?? []) as TaskRow[]).map((t) => toPublicTask(t, meeting.title)));
  if (tasks.length === 0) {
    return NextResponse.json({ error: "This meeting has no tasks to add yet." }, { status: 400 });
  }

  const stored = await loadConnector<MicrosoftCredentials, MicrosoftConfig>(auth.user.id, "microsoft");
  if (!stored) return NextResponse.json({ error: "Connect Microsoft in Settings first." }, { status: 400 });
  if (!stored.config.workbookId) {
    return NextResponse.json({ error: "Choose a workbook in Settings first." }, { status: 400 });
  }

  try {
    const rows = tasksToRows(tasks, meeting.title, meeting.recorded_at);
    const written = await appendTasks(
      auth.user.id,
      stored.credentials,
      stored.config,
      stored.config.workbookId,
      rows,
    );
    await noteConnectorError(auth.user.id, "microsoft", null);
    console.log(JSON.stringify({ event: "excel_append", id, rows: written }));
    return NextResponse.json({ ok: true, rows: written, workbook: stored.config.workbookName ?? "your workbook" });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Couldn't write to that workbook.";
    await noteConnectorError(auth.user.id, "microsoft", message);
    console.error(JSON.stringify({ event: "excel_append_error", id, message }));
    return NextResponse.json({ error: message, needsReconnect: err instanceof MicrosoftReconnectError }, { status: 502 });
  }
}
