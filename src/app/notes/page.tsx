import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
import { isOwnerEmail } from "@/lib/admin";
import { formatTimestamp } from "@/lib/transcript";
import { formatUsd } from "@/lib/cost";
import { toPublicSummary, type Meeting } from "@/lib/meeting";
import { EmptyState, StatusPill } from "@/components/ui";
import DeleteMeetingButton from "./delete-button";

export const dynamic = "force-dynamic";
export const metadata = { title: "Notes · From the Call" };

type Row = Pick<Meeting, "id" | "title" | "status" | "error" | "duration_seconds" | "recorded_at" | "transcription_cost_usd" | "llm_cost_usd"> & {
  notes: { summary?: string } | null;
};

export default async function NotesPage() {
  const db = await supabaseServer();
  const { data: userData } = await db.auth.getUser();
  const owner = isOwnerEmail(userData.user?.email);

  const { data, error } = await db
    .from("meetings")
    .select("id,title,status,error,duration_seconds,recorded_at,transcription_cost_usd,llm_cost_usd,notes")
    .order("recorded_at", { ascending: false })
    .limit(200);

  const rows = (data ?? []) as Row[];
  const meetings = rows.map((r) => ({ ...toPublicSummary(r, owner), summary: r.notes?.summary ?? null }));
  const totalSeconds = meetings.reduce((n, m) => n + (m.durationSeconds ?? 0), 0);

  return (
    <section className="flex flex-col gap-6 pt-10">
      <div className="rise flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Notes</h1>
          {meetings.length > 0 ? (
            <p className="mt-1 text-sm text-muted">
              {meetings.length} meeting{meetings.length === 1 ? "" : "s"} · {formatTimestamp(totalSeconds)} of audio
              {owner ? ` · ${formatUsd(meetings.reduce((n, m) => n + (m.internal?.costUsd ?? 0), 0))} spent` : ""}
            </p>
          ) : null}
        </div>
        <Link href="/record" className="btn btn-primary">New meeting</Link>
      </div>

      {error ? <p className="glass p-4 text-sm text-danger">Could not load your notes. Refresh to try again.</p> : null}

      {meetings.length === 0 && !error ? (
        <EmptyState
          title="No notes yet"
          body="Record your first meeting and the summary, decisions and follow-ups will show up here."
          action={<Link href="/record" className="btn btn-primary">Record a meeting</Link>}
        />
      ) : null}

      <ul className="stagger flex flex-col gap-3">
        {meetings.map((m) => (
          <li key={m.id} className="glass glass-hover flex flex-wrap items-start gap-3 p-4">
            <Link href={`/meetings/${m.id}`} className="group min-w-0 flex-1">
              <span className="block truncate font-medium transition-colors group-hover:text-accent">{m.title}</span>
              {/* line-clamp sets its own display, so no `block` here or it wins and the clamp is lost. */}
              {m.summary ? <span className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-muted">{m.summary}</span> : null}
              <span className="mt-1.5 block text-xs text-muted">
                {new Date(m.recordedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
                {m.durationSeconds ? ` · ${formatTimestamp(m.durationSeconds)}` : ""}
                {owner && m.internal ? ` · ${formatUsd(m.internal.costUsd)}` : ""}
              </span>
            </Link>
            <span className="flex flex-none items-center gap-2">
              <StatusPill status={m.status} />
              <DeleteMeetingButton id={m.id} />
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
