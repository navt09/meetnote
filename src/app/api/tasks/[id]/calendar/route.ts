import { NextResponse } from "next/server";
import { getAuth } from "@/lib/supabase/server";
import { loadConnector, noteConnectorError } from "@/lib/connector-store";
import { createEvent, GoogleReconnectError, hasScope, SCOPE_CALENDAR_WRITE } from "@/lib/providers/google";
import { describeSlot, parseDue, slotFor, toIso } from "@/lib/schedule";
import type { GoogleConfig, GoogleCredentials } from "@/lib/connectors";
import type { TaskRow } from "@/lib/task";

export const runtime = "nodejs";
export const maxDuration = 60;

type Ctx = { params: Promise<{ id: string }> };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** How long to block out for a task, by kind. Plain rules, no model involved. */
const MINUTES: Record<string, number> = { bug: 60, feature: 90, task: 60, follow_up: 30, other: 60 };

/**
 * Blocks time out on the user's calendar for one task. Nothing is invited and
 * nobody is emailed; it is a private block on their own calendar.
 */
export async function POST(req: Request, ctx: Ctx) {
  const auth = await getAuth(req);
  if (!auth) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const { data, error } = await auth.db.from("tasks").select("*").eq("id", id).maybeSingle();
  if (error) {
    console.error(JSON.stringify({ event: "task_calendar_lookup_error", id, message: error.message }));
    return NextResponse.json({ error: "Could not load that task." }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: "Task not found" }, { status: 404 });
  const task = data as TaskRow & { calendar_event_url: string | null };

  if (task.calendar_event_url) {
    return NextResponse.json({ error: "That task is already on your calendar.", url: task.calendar_event_url }, { status: 409 });
  }

  const stored = await loadConnector<GoogleCredentials, GoogleConfig>(auth.user.id, "google");
  if (!stored) return NextResponse.json({ error: "Connect Google in Settings first." }, { status: 400 });
  if (!hasScope(stored.config.scopes ?? [], SCOPE_CALENDAR_WRITE)) {
    return NextResponse.json(
      { error: "Meetnote can read your calendar but not add to it. Reconnect Google in Settings to allow it." },
      { status: 400 },
    );
  }

  const now = new Date();
  // A stated due date wins; otherwise block time out tomorrow rather than guess.
  const due = parseDue(task.due, now) ?? new Date(now.getTime() + 24 * 3600_000);
  const slot = slotFor(due, MINUTES[task.kind] ?? 60, now);

  const description = [task.details, "", `From Meetnote · ${task.owner ? `owner: ${task.owner}` : "unassigned"}`]
    .filter(Boolean)
    .join("\n");

  try {
    const created = await createEvent(auth.user.id, stored.credentials, stored.config, {
      title: task.title,
      start: toIso(slot.start),
      end: toIso(slot.end),
      description,
      notify: false,
    });
    await noteConnectorError(auth.user.id, "google", null);
    await auth.db
      .from("tasks")
      .update({ calendar_event_url: created.url, calendar_event_at: created.start })
      .eq("id", id);

    return NextResponse.json({ ok: true, url: created.url, when: describeSlot(slot) }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Couldn't add that to your calendar.";
    await noteConnectorError(auth.user.id, "google", message);
    console.error(JSON.stringify({ event: "task_calendar_error", id, message }));
    return NextResponse.json({ error: message, needsReconnect: err instanceof GoogleReconnectError }, { status: 502 });
  }
}
