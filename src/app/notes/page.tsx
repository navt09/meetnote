import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
import { isOwnerEmail } from "@/lib/admin";
import { formatTimestamp } from "@/lib/transcript";
import { formatUsd } from "@/lib/cost";
import { toPublicSummary, type Meeting } from "@/lib/meeting";
import { EmptyState, PageHead, StatusPill, Tally } from "@/components/ui";
import DeleteMeetingButton from "./delete-button";
import SearchBox from "./search-box";

export const dynamic = "force-dynamic";
export const metadata = { title: "Notes · From the Call" };

type Row = Pick<Meeting, "id" | "title" | "status" | "error" | "duration_seconds" | "recorded_at" | "transcription_cost_usd" | "llm_cost_usd"> & {
  notes: {
    summary?: string;
    action_items?: unknown[];
    decisions?: unknown[];
    people_to_contact?: unknown[];
  } | null;
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
  // The counts are the reason to open one of these, so the list carries them
  // rather than making people click to find out whether anything came of it.
  const meetings = rows.map((r) => ({
    ...toPublicSummary(r, owner),
    summary: r.notes?.summary ?? null,
    tasks: r.notes?.action_items?.length ?? 0,
    decisions: r.notes?.decisions?.length ?? 0,
    people: r.notes?.people_to_contact?.length ?? 0,
  }));
  const totalSeconds = meetings.reduce((n, m) => n + (m.durationSeconds ?? 0), 0);

  return (
    <section className="flex flex-col gap-6 pt-10">
      <PageHead
        title="Notes"
        meta={
          meetings.length > 0 ? (
            <>
              {meetings.length} meeting{meetings.length === 1 ? "" : "s"} · {formatTimestamp(totalSeconds)} of audio
              {owner ? ` · ${formatUsd(meetings.reduce((n, m) => n + (m.internal?.costUsd ?? 0), 0))} spent` : ""}
            </>
          ) : null
        }
        action={<Link href="/record" className="btn btn-primary">New meeting</Link>}
      />

      {error ? <p className="glass p-4 text-sm text-danger">Could not load your notes. Refresh to try again.</p> : null}

      {meetings.length === 0 && !error ? (
        <EmptyState
          title="No notes yet"
          body="Record your first meeting and the summary, decisions and follow-ups will show up here."
          action={<Link href="/record" className="btn btn-primary">Record a meeting</Link>}
        />
      ) : null}

      <SearchBox>
      <ul className="stagger flex flex-col gap-3">
        {meetings.map((m) => (
          <li key={m.id} className="glass glass-hover flex flex-wrap items-start gap-3 p-4">
            <Link href={`/meetings/${m.id}`} className="group min-w-0 flex-1 basis-56">
              <span className="block truncate font-medium transition-colors group-hover:text-accent">{m.title}</span>
              {/* line-clamp sets its own display, so no `block` here or it wins and the clamp is lost. */}
              {m.summary ? <span className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-muted">{m.summary}</span> : null}
              <Tally tasks={m.tasks} decisions={m.decisions} people={m.people} />
              <span className="mt-2 block text-xs text-faint">
                <span className="figure">
                  {new Date(m.recordedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
                  {m.durationSeconds ? ` · ${formatTimestamp(m.durationSeconds)}` : ""}
                  {owner && m.internal ? ` · ${formatUsd(m.internal.costUsd)}` : ""}
                </span>
              </span>
            </Link>
            <span className="flex flex-none items-center gap-2">
              <StatusPill status={m.status} />
              <DeleteMeetingButton id={m.id} />
            </span>
          </li>
        ))}
      </ul>
      </SearchBox>
    </section>
  );
}
