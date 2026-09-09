"use client";

import { useEffect, useState } from "react";
import { Tilt } from "./tilt";
import { useReducedMotion } from "@/lib/use-reduced-motion";

/**
 * The landing page hero: the product, doing the thing, on a loop.
 *
 * A short standup types itself out. Each time someone commits to something, it
 * is lifted out into a task on the right. When the meeting ends, the first task
 * is drafted as a ticket and waits for Approve. A visitor can press it; if they
 * do not, it approves itself, then the whole thing starts again.
 *
 * Nothing here is random and nothing reads the clock during render: the script
 * is fixed and the only moving state is how far through it we are, so the
 * server render and the first client frame are identical.
 *
 * Under prefers-reduced-motion the final frame is rendered once, statically.
 */

type Task = { title: string; owner: string; due?: string };
type Line = { who: string; text: string; task?: Task };
type Phase = "idle" | "typing" | "drafting" | "approved";

const SCRIPT: Line[] = [
  { who: "Maya", text: "Staging fell over again last night. Same cache thing." },
  {
    who: "Dev",
    text: "I'll fix the CI cache step today, it's the restore key.",
    task: { title: "Fix CI cache restore key on staging", owner: "Dev", due: "Today" },
  },
  { who: "Maya", text: "Can invoice export ship by Thursday?" },
  {
    who: "Priya",
    text: "Yes. PR up by Wednesday, I'll tag you for review.",
    task: { title: "Invoice export PR, ready for review", owner: "Priya", due: "Wed" },
  },
  {
    who: "Dev",
    text: "Someone should warn Sam at Acme the API change is coming.",
    task: { title: "Tell Sam at Acme about the API change", owner: "Unassigned" },
  },
];

/** Ticks of silence between one person finishing and the next starting. */
const GAP = 14;
const TICK_MS = 28;

const OFFSETS = SCRIPT.reduce<{ start: number; end: number }[]>((acc, line) => {
  const start = acc.length ? acc[acc.length - 1].end + GAP : 0;
  acc.push({ start, end: start + line.text.length });
  return acc;
}, []);
const TOTAL = OFFSETS[OFFSETS.length - 1].end + 6;

function Wave({ live }: { live: boolean }) {
  return (
    <span aria-hidden className={`wave ${live ? "is-live" : ""}`}>
      {Array.from({ length: 14 }, (_, i) => (
        <i key={i} style={{ "--i": i } as React.CSSProperties} />
      ))}
    </span>
  );
}

export function HeroDemo() {
  const reduce = useReducedMotion();
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);

  // A beat after load before anyone starts talking.
  useEffect(() => {
    if (reduce || phase !== "idle") return;
    const id = setTimeout(() => setPhase("typing"), 500);
    return () => clearTimeout(id);
  }, [phase, reduce]);

  // The typing itself.
  useEffect(() => {
    if (reduce || phase !== "typing") return;
    const id = setInterval(() => setProgress((p) => Math.min(TOTAL, p + 1)), TICK_MS);
    return () => clearInterval(id);
  }, [phase, reduce]);

  // Meeting over: draft the ticket.
  useEffect(() => {
    if (reduce || phase !== "typing" || progress < TOTAL) return;
    const id = setTimeout(() => setPhase("drafting"), 700);
    return () => clearTimeout(id);
  }, [phase, progress, reduce]);

  // Nobody pressed Approve: press it for them.
  useEffect(() => {
    if (reduce || phase !== "drafting") return;
    const id = setTimeout(() => setPhase("approved"), 3600);
    return () => clearTimeout(id);
  }, [phase, reduce]);

  // Hold on the result, then go again.
  useEffect(() => {
    if (reduce || phase !== "approved") return;
    const id = setTimeout(() => {
      setProgress(0);
      setPhase("typing");
    }, 3000);
    return () => clearTimeout(id);
  }, [phase, reduce]);

  const shown = reduce ? TOTAL : progress;
  const ph: Phase = reduce ? "approved" : phase;
  const live = ph === "typing";

  const tasks = SCRIPT.flatMap((line, i) => (line.task && shown >= OFFSETS[i].end ? [{ ...line.task, i }] : []));
  const ticketVisible = ph === "drafting" || ph === "approved";

  return (
    <div className="glass overflow-hidden">
      <div className="grid sm:grid-cols-[1.15fr_1fr]">
        {/* ---- the meeting ---- */}
        <div className="border-b border-panel-border p-5 sm:border-b-0 sm:border-r">
          <div className="flex items-center justify-between gap-3">
            <p className="flex items-center gap-2 text-xs text-muted">
              <span aria-hidden className={`h-2 w-2 rounded-full ${live ? "bg-danger" : "bg-faint"}`} />
              {live ? "Recording" : ph === "idle" ? "Ready" : "Meeting ended"} · Tuesday standup
            </p>
            <Wave live={live} />
          </div>

          <ol className="mt-4 flex min-h-[18.5rem] flex-col gap-3 font-mono text-[0.8125rem] leading-relaxed">
            {SCRIPT.map((line, i) => {
              const { start, end } = OFFSETS[i];
              if (shown < start) return null;
              const chars = Math.min(line.text.length, shown - start);
              const done = shown >= end;
              const typing = !done && live;
              return (
                <li key={i}>
                  <span className="text-accent">{line.who}</span>
                  <span className="text-faint"> · </span>
                  <span className={line.task && done ? "rounded bg-work/15 px-1 text-fg" : "text-muted"}>
                    {line.text.slice(0, chars)}
                  </span>
                  {typing ? <span className="type-cursor" /> : null}
                </li>
              );
            })}
          </ol>
        </div>

        {/* ---- what came out of it ---- */}
        <div className="p-5">
          <p className="text-xs text-muted">Pulled out as it goes</p>
          <ul className="mt-3 flex min-h-[7.5rem] flex-col gap-2">
            {tasks.length === 0 ? <li className="text-xs text-faint">Listening…</li> : null}
            {tasks.map((t) => (
              <li key={t.i} className="task-in rounded-lg border border-work/30 bg-work/10 px-3 py-2">
                <p className="text-sm font-medium leading-snug">{t.title}</p>
                <p className="mt-0.5 text-xs text-muted">
                  {t.owner === "Unassigned" ? "Nobody said who. Left blank, not guessed." : `${t.owner}${t.due ? ` · ${t.due}` : ""}`}
                </p>
              </li>
            ))}
          </ul>

          {ticketVisible ? (
            <Tilt className="mt-4">
              <div className="ticket-in rounded-lg border border-panel-border bg-bg-elev p-3.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="pill border-work/40 text-work">Linear · ENG</span>
                  <span className="text-xs text-faint">{ph === "approved" ? "Approved" : "Draft, waiting for you"}</span>
                </div>
                <p className="mt-2.5 text-sm font-semibold leading-snug">Fix CI cache restore key on staging</p>
                <p className="mt-1 text-xs leading-relaxed text-muted">
                  Staging deploy failed overnight. Dev traced it to a stale cache restore key. Done when a deploy passes
                  twice in a row with a warm cache.
                </p>
                <div className="mt-3 flex items-center justify-between gap-2">
                  <span className="text-xs text-faint">Dev · today</span>
                  {ph === "approved" ? (
                    <span className="pill pill-ok task-in">Created ENG-142 in Linear</span>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-primary pulse-ring !py-1 text-xs"
                      onClick={() => setPhase("approved")}
                    >
                      Approve
                    </button>
                  )}
                </div>
              </div>
            </Tilt>
          ) : null}
        </div>
      </div>
    </div>
  );
}
