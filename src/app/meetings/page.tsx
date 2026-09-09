import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
import { formatTimestamp } from "@/lib/transcript";
import { formatUsd } from "@/lib/cost";
import { statusLabel, type MeetingSummary } from "@/lib/meeting";
import DeleteMeetingButton from "./delete-button";

export const dynamic = "force-dynamic";
export const metadata = { title: "Meetings · Meetnote" };

export default async function MeetingsPage() {
  const db = await supabaseServer();
  const { data, error } = await db
    .from("meetings")
    .select("id,title,status,error,duration_seconds,recorded_at,transcription_cost_usd,llm_cost_usd")
    .order("recorded_at", { ascending: false })
    .limit(200);
  const meetings = (data ?? []) as MeetingSummary[];

  return (
    <section className="flex flex-col gap-6 pt-10">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Meetings</h1>
        <Link href="/record" className="btn btn-primary">New recording</Link>
      </div>

      {error ? <p className="text-sm text-danger">{error.message}</p> : null}

      {meetings.length === 0 && !error ? (
        <div className="glass p-8 text-center">
          <p className="font-medium">No meetings yet</p>
          <p className="mt-1 text-sm text-muted">Record your first one and the notes will show up here.</p>
        </div>
      ) : null}

      <ul className="flex flex-col gap-3">
        {meetings.map((m) => (
          <li key={m.id} className="glass flex flex-wrap items-center justify-between gap-3 p-4">
            <div className="min-w-0 flex-1">
              <Link href={`/meetings/${m.id}`} className="block truncate font-medium hover:text-accent">{m.title}</Link>
              <p className="mt-1 text-xs text-muted">
                {new Date(m.recorded_at).toLocaleString()}
                {m.duration_seconds ? ` · ${formatTimestamp(Number(m.duration_seconds))}` : ""}
                {m.status === "done" ? ` · ${formatUsd(Number(m.transcription_cost_usd) + Number(m.llm_cost_usd))}` : ""}
              </p>
            </div>
            <span className={`pill ${m.status === "error" ? "text-danger" : m.status === "done" ? "text-ok" : ""}`}>{statusLabel(m.status)}</span>
            <DeleteMeetingButton id={m.id} />
          </li>
        ))}
      </ul>
    </section>
  );
}
