import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
import { isOwnerEmail } from "@/lib/admin";
import { formatUsd } from "@/lib/cost";
import type { MeetingStatus } from "@/lib/meeting";
import type { TaskPriority, TaskKind } from "@/lib/task";
import { countByWeek, delta, deltaLabel, humanDuration, sumByWeek, weekBuckets } from "@/lib/stats";
import ActivityChart, { type ActivityWeek } from "@/components/activity-chart";
import { HeroFigure, StatTile } from "@/components/stat-tile";
import { StatusPill } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Dashboard · From the Call" };

const WEEKS = 8;

type MeetingRow = {
  id: string;
  title: string;
  status: MeetingStatus;
  recorded_at: string;
  duration_seconds: number | null;
  transcription_cost_usd: number;
  llm_cost_usd: number;
  notes: { summary?: string; people_to_contact?: { name: string; role: string | null; why: string }[] } | null;
};

type TaskRow = {
  id: string;
  title: string;
  status: string;
  priority: TaskPriority;
  kind: TaskKind;
  owner: string | null;
  due: string | null;
  completed_at: string | null;
  created_at: string;
  meeting_id: string;
  meetings: { title: string } | null;
};

export default async function DashboardPage() {
  const db = await supabaseServer();
  const { data: userData } = await db.auth.getUser();
  const owner = isOwnerEmail(userData.user?.email);

  const [meetingsRes, tasksRes] = await Promise.all([
    db
      .from("meetings")
      .select("id,title,status,recorded_at,duration_seconds,transcription_cost_usd,llm_cost_usd,notes")
      .order("recorded_at", { ascending: false })
      .limit(300),
    db
      .from("tasks")
      .select("id,title,status,priority,kind,owner,due,completed_at,created_at,meeting_id,meetings(title)")
      .limit(500),
  ]);

  const meetings = (meetingsRes.data ?? []) as MeetingRow[];
  const tasks = (tasksRes.data ?? []) as unknown as TaskRow[];

  const now = new Date();
  const buckets = weekBuckets(WEEKS, now);
  const doneTasks = tasks.filter((t) => t.status === "done" && t.completed_at);
  const openTasks = tasks.filter((t) => t.status === "open");

  const meetingsPerWeek = countByWeek(meetings, (m) => m.recorded_at, buckets);
  const secondsPerWeek = sumByWeek(meetings, (m) => m.recorded_at, (m) => Number(m.duration_seconds ?? 0), buckets);
  const donePerWeek = countByWeek(doneTasks, (t) => t.completed_at, buckets);

  const last = WEEKS - 1;
  const prev = WEEKS - 2;
  const weeks: ActivityWeek[] = buckets.map((b, i) => ({ label: b.label, meetings: meetingsPerWeek[i], tasksDone: donePerWeek[i] }));

  const dMeetings = delta(meetingsPerWeek[last], meetingsPerWeek[prev] ?? 0);
  const dSeconds = delta(secondsPerWeek[last], secondsPerWeek[prev] ?? 0);
  const dDone = delta(donePerWeek[last], donePerWeek[prev] ?? 0);

  const highPriorityOpen = openTasks.filter((t) => t.priority === "high").length;
  const topTasks = [...openTasks]
    .sort((a, b) => {
      const rank = { high: 0, medium: 1, low: 2 } as const;
      if (rank[a.priority] !== rank[b.priority]) return rank[a.priority] - rank[b.priority];
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    })
    .slice(0, 5);

  const recent = meetings.slice(0, 3);

  // People named across the three most recent meetings, most recent first.
  const people: { name: string; role: string | null; why: string; meetingId: string }[] = [];
  for (const m of meetings.slice(0, 8)) {
    for (const p of m.notes?.people_to_contact ?? []) {
      if (!people.some((x) => x.name.toLowerCase() === p.name.toLowerCase())) {
        people.push({ ...p, meetingId: m.id });
      }
    }
  }

  const totalSpend = meetings.reduce((n, m) => n + Number(m.transcription_cost_usd ?? 0) + Number(m.llm_cost_usd ?? 0), 0);

  // The layout is the same whether or not there is anything yet; each section
  // says its own "nothing here". A first-time user sees the shape of the app.
  const firstRun = meetings.length === 0;
  const heroSub = firstRun
    ? "Record a meeting and the tasks people agree to will land here."
    : openTasks.length === 0
      ? "Everything from your meetings is done."
      : `${highPriorityOpen > 0 ? `${highPriorityOpen} high priority · ` : ""}across ${meetings.length} meeting${meetings.length === 1 ? "" : "s"}`;

  return (
    <section className="flex flex-col gap-6 pt-10">
      <div className="rise flex flex-wrap items-end justify-between gap-6">
        <HeroFigure label="Still to do" value={String(openTasks.length)} sub={heroSub} />
        <div className="flex gap-2">
          {firstRun ? null : <Link href="/tasks" className="btn btn-ghost">View tasks</Link>}
          <Link href="/record" className="btn btn-primary">New meeting</Link>
        </div>
      </div>

      <div className="stagger grid gap-3 sm:grid-cols-3">
        <StatTile
          label="Meetings this week"
          value={String(meetingsPerWeek[last])}
          delta={dMeetings}
          deltaText={deltaLabel(dMeetings)}
          goodDirection="none"
        />
        <StatTile
          label="Recorded this week"
          value={humanDuration(secondsPerWeek[last])}
          delta={dSeconds}
          deltaText={
            dSeconds.direction === "flat"
              ? "same as last week"
              : `${dSeconds.change > 0 ? "+" : "-"}${humanDuration(Math.abs(dSeconds.change))} vs last week`
          }
          goodDirection="none"
        />
        <StatTile
          label="Tasks done this week"
          value={String(donePerWeek[last])}
          delta={dDone}
          deltaText={deltaLabel(dDone)}
          goodDirection="up"
        />
      </div>

      <div className="glass rise p-6">
        <ActivityChart weeks={weeks} />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="glass rise p-6">
          <div className="flex items-baseline justify-between">
            <p className="text-xs text-muted">Top of the list</p>
            <Link href="/tasks" className="text-xs text-faint transition-colors hover:text-fg">All tasks</Link>
          </div>
          <ul className="mt-4 divide-y divide-panel-border">
            {topTasks.map((t) => (
              <li key={t.id} className="py-3 first:pt-0 last:pb-0">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-medium leading-snug">{t.title}</p>
                  {t.priority === "high" ? <span className="pill pill-danger flex-none">high</span> : null}
                </div>
                <p className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-faint">
                  <span>{t.owner ?? "unassigned"}</span>
                  {t.due ? <span className="text-warn">due {t.due}</span> : null}
                  <Link href={`/meetings/${t.meeting_id}`} className="truncate transition-colors hover:text-fg">
                    {t.meetings?.title ?? "meeting"}
                  </Link>
                </p>
              </li>
            ))}
            {topTasks.length === 0 ? <li className="py-3 text-sm text-muted">Nothing outstanding.</li> : null}
          </ul>
        </div>

        <div className="flex flex-col gap-3">
          <div className="glass rise p-6">
            <div className="flex items-baseline justify-between">
              <p className="text-xs text-muted">Recent meetings</p>
              <Link href="/notes" className="text-xs text-faint transition-colors hover:text-fg">All notes</Link>
            </div>
            <ul className="mt-4 divide-y divide-panel-border">
              {recent.map((m) => (
                <li key={m.id} className="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0">
                  <Link href={`/meetings/${m.id}`} className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium transition-colors hover:text-accent">{m.title}</span>
                    <span className="mt-0.5 block text-xs text-faint">
                      {new Date(m.recorded_at).toLocaleDateString(undefined, { day: "numeric", month: "short" })}
                      {m.duration_seconds ? ` · ${humanDuration(Number(m.duration_seconds))}` : ""}
                    </span>
                  </Link>
                  {m.status !== "done" ? <StatusPill status={m.status} /> : null}
                </li>
              ))}
              {recent.length === 0 ? (
                <li className="py-3 text-sm text-muted">
                  Nothing recorded yet. <Link href="/record" className="text-accent hover:underline">Record your first meeting</Link>.
                </li>
              ) : null}
            </ul>
          </div>

          <div className="glass rise p-6">
            <p className="text-xs text-muted">People to follow up with</p>
            <ul className="mt-4 divide-y divide-panel-border text-sm">
              {people.slice(0, 4).map((p) => (
                <li key={p.name} className="py-3 first:pt-0 last:pb-0">
                  <p className="font-medium">
                    {p.name}
                    {p.role ? <span className="font-normal text-faint"> · {p.role}</span> : null}
                  </p>
                  <p className="mt-0.5 line-clamp-2 text-muted">{p.why}</p>
                </li>
              ))}
              {people.length === 0 ? <li className="py-3 text-muted">Nobody flagged yet.</li> : null}
            </ul>
          </div>
        </div>
      </div>

      {owner ? (
        <p className="text-center text-xs text-muted">
          {formatUsd(totalSpend)} spent across {meetings.length} meeting{meetings.length === 1 ? "" : "s"} · visible to you only
        </p>
      ) : null}
    </section>
  );
}
