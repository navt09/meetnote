import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
import { isOwnerEmail } from "@/lib/admin";
import { formatTimestamp } from "@/lib/transcript";
import { formatUsd } from "@/lib/cost";
import { toPublicSummary, type Meeting } from "@/lib/meeting";
import { EmptyState, StatusPill } from "@/components/ui";
import DeleteMeetingButton from "./delete-button";

export const dynamic = "force-dynamic";
export const metadata = { title: "Meetings · Meetnote" };

type Row = Pick<Meeting, "id" | "title" | "status" | "error" | "duration_seconds" | "recorded_at" | "transcription_cost_usd" | "llm_cost_usd">;

export default async function MeetingsPage() {
  const db = await supabaseServer();
  const { data: userData } = await db.auth.getUser();
  const owner = isOwnerEmail(userData.user?.email);

  const { data, error } = await db
    .from("meetings")
    .select("id,title,status,error,duration_seconds,recorded_at,transcription_cost_usd,llm_cost_usd")
    .order("recorded_at", { ascending: false })
    .limit(200);

  const meetings = ((data ?? []) as Row[]).map((r) => toPublicSummary(r, owner));
  const totalSeconds = meetings.reduce((n, m) => n + (m.durationSeconds ?? 0), 0);

  return (
    <section className="flex flex-col gap-6 pt-10">
      <div className="rise flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Meetings</h1>
          {meetings.length > 0 ? (
            <p className="mt-1 text-sm text-muted">
              {meetings.length} recorded · {formatTimestamp(totalSeconds)} of audio
              {owner ? ` · ${formatUsd(meetings.reduce((n, m) => n + (m.internal?.costUsd ?? 0), 0))} spent` : ""}
            </p>
          ) : null}
        </div>
        <Link href="/record" className="btn btn-primary">New recording</Link>
      </div>

      {error ? <p className="glass p-4 text-sm text-danger">Could not load your meetings. Refresh to try again.</p> : null}

      {meetings.length === 0 && !error ? (
        <EmptyState
          title="No meetings yet"
          body="Record your first one and the summary, tasks and follow-ups will show up here."
          action={<Link href="/record" className="btn btn-primary">Record a meeting</Link>}
        />
      ) : null}

      <ul className="stagger flex flex-col gap-3">
        {meetings.map((m) => (
          <li key={m.id} className="glass glass-hover flex flex-wrap items-center gap-3 p-4">
            <Link href={`/meetings/${m.id}`} className="min-w-0 flex-1 group">
              <span className="block truncate font-medium transition-colors group-hover:text-accent">{m.title}</span>
              <span className="mt-1 block text-xs text-muted">
                {new Date(m.recordedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
                {m.durationSeconds ? ` · ${formatTimestamp(m.durationSeconds)}` : ""}
                {owner && m.internal ? ` · ${formatUsd(m.internal.costUsd)}` : ""}
              </span>
            </Link>
            <StatusPill status={m.status} />
            <DeleteMeetingButton id={m.id} />
          </li>
        ))}
      </ul>
    </section>
  );
}
