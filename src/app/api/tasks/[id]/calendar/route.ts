import { NextResponse } from "next/server";
import { isBlocked, requireConnections } from "@/lib/guard";
import { loadConnector, noteConnectorError } from "@/lib/connector-store";
import { createEvent, GoogleReconnectError, hasScope, SCOPE_CALENDAR_WRITE } from "@/lib/providers/google";
import { describeSlot, parseDue, slotFor, toIso } from "@/lib/schedule";
import { createEvent as createOutlookEvent } from "@/lib/providers/outlook";
import { MicrosoftReconnectError } from "@/lib/providers/microsoft";
import type { GoogleConfig, GoogleCredentials, MicrosoftConfig, MicrosoftCredentials } from "@/lib/connectors";
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
  const gate = await requireConnections(req);
  if (isBlocked(gate)) return gate;
  const { auth } = gate;
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

  // Either calendar, whichever is connected. Google first only because it came
  // first; a person with both gets one block, not two.
  const google = await loadConnector<GoogleCredentials, GoogleConfig>(auth.user.id, "google");
  const canGoogle = !!google && hasScope(google.config.scopes ?? [], SCOPE_CALENDAR_WRITE);
  const ms = canGoogle ? null : await loadConnector<MicrosoftCredentials, MicrosoftConfig>(auth.user.id, "microsoft");
  const canMicrosoft = !!ms && (ms.config.scopes ?? []).includes("Calendars.ReadWrite");

  if (!canGoogle && !canMicrosoft) {
    // Three different situations, three different fixes, so they get three
    // different sentences rather than one that fits none of them.
    const message = google
      ? "From the Call can read your Google calendar but not add to it. Reconnect Google in Settings to allow it."
      : ms
        ? "That Microsoft connection cannot add calendar events. Reconnect Microsoft in Settings to allow it."
        : "Connect Google or Microsoft in Settings first.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
  const provider = canGoogle ? "google" : "microsoft";

  const now = new Date();
  // A stated due date wins; otherwise block time out tomorrow rather than guess.
  const due = parseDue(task.due, now) ?? new Date(now.getTime() + 24 * 3600_000);
  const slot = slotFor(due, MINUTES[task.kind] ?? 60, now);

  const description = [task.details, "", `From From the Call · ${task.owner ? `owner: ${task.owner}` : "unassigned"}`]
    .filter(Boolean)
    .join("\n");

  try {
    const created = canGoogle
      ? await createEvent(auth.user.id, google!.credentials, google!.config, {
          title: task.title,
          start: toIso(slot.start),
          end: toIso(slot.end),
          description,
          notify: false,
        })
      : await createOutlookEvent(auth.user.id, ms!.credentials, ms!.config, {
          title: task.title,
          start: toIso(slot.start),
          end: toIso(slot.end),
          description,
        });
    await noteConnectorError(auth.user.id, provider, null);
    await auth.db
      .from("tasks")
      .update({ calendar_event_url: created.url, calendar_event_at: created.start })
      .eq("id", id);

    return NextResponse.json({ ok: true, url: created.url, when: describeSlot(slot) }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Couldn't add that to your calendar.";
    await noteConnectorError(auth.user.id, provider, message);
    console.error(JSON.stringify({ event: "task_calendar_error", id, provider, message }));
    const needsReconnect = err instanceof GoogleReconnectError || err instanceof MicrosoftReconnectError;
    return NextResponse.json({ error: message, needsReconnect }, { status: 502 });
  }
}
