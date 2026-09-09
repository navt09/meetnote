"use client";

import { useState } from "react";
import { axisMax } from "@/lib/stats";

export type ActivityWeek = { label: string; meetings: number; tasksDone: number };

const SERIES = [
  { key: "meetings" as const, name: "Meetings", color: "var(--chart-1)" },
  { key: "tasksDone" as const, name: "Tasks done", color: "var(--chart-2)" },
];

// Chart geometry in viewBox units.
const W = 640;
const H = 220;
const PAD = { top: 12, right: 8, bottom: 28, left: 30 };
const PLOT_W = W - PAD.left - PAD.right;
const PLOT_H = H - PAD.top - PAD.bottom;
const BAR_GAP = 2; // surface gap between adjacent bars
const RADIUS = 4; // rounded data-end

export default function ActivityChart({ weeks }: { weeks: ActivityWeek[] }) {
  const [hover, setHover] = useState<number | null>(null);

  const max = axisMax(weeks.flatMap((w) => [w.meetings, w.tasksDone]));
  const ticks = max <= 4 ? Array.from({ length: max + 1 }, (_, i) => i) : [0, max / 2, max];

  const colW = PLOT_W / Math.max(1, weeks.length);
  const groupW = Math.min(46, colW * 0.62);
  const barW = (groupW - BAR_GAP) / 2;
  const y = (v: number) => PAD.top + PLOT_H - (v / max) * PLOT_H;
  const colX = (i: number) => PAD.left + colW * i + colW / 2;

  const active = hover === null ? null : weeks[hover];
  const empty = weeks.every((w) => w.meetings === 0 && w.tasksDone === 0);

  return (
    <figure className="m-0">
      <figcaption className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm font-medium">Last {weeks.length} weeks</span>
        {/* Legend: two series, so identity is never colour alone. */}
        <span className="flex items-center gap-4 text-xs text-muted">
          {SERIES.map((s) => (
            <span key={s.key} className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-[2px]" style={{ background: s.color }} aria-hidden />
              {s.name}
            </span>
          ))}
        </span>
      </figcaption>

      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`Meetings and tasks completed over the last ${weeks.length} weeks`}>
          {/* Recessive solid gridlines, never dashed. */}
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} stroke="var(--chart-grid)" strokeWidth="1" />
              <text x={PAD.left - 8} y={y(t) + 4} textAnchor="end" className="fill-muted" style={{ fontSize: 11 }}>
                {t}
              </text>
            </g>
          ))}

          {weeks.map((w, i) => {
            const gx = colX(i) - groupW / 2;
            return (
              <g key={w.label}>
                {/* Full-column hit target, larger than the marks themselves. */}
                <rect
                  x={PAD.left + colW * i}
                  y={PAD.top}
                  width={colW}
                  height={PLOT_H}
                  fill={hover === i ? "rgba(255,255,255,0.035)" : "transparent"}
                  onMouseEnter={() => setHover(i)}
                  onMouseLeave={() => setHover(null)}
                />
                {SERIES.map((s, si) => {
                  const v = w[s.key];
                  const h = v === 0 ? 0 : Math.max(RADIUS, (v / max) * PLOT_H);
                  if (h === 0) return null;
                  return (
                    <rect
                      key={s.key}
                      x={gx + si * (barW + BAR_GAP)}
                      y={PAD.top + PLOT_H - h}
                      width={barW}
                      height={h}
                      rx={RADIUS}
                      fill={s.color}
                      opacity={hover === null || hover === i ? 1 : 0.45}
                      style={{ transition: "opacity 160ms ease" }}
                      pointerEvents="none"
                    />
                  );
                })}
                <text x={colX(i)} y={H - 8} textAnchor="middle" className="fill-muted" style={{ fontSize: 11 }}>
                  {w.label}
                </text>
              </g>
            );
          })}

          <line x1={PAD.left} x2={W - PAD.right} y1={y(0)} y2={y(0)} stroke="var(--chart-grid)" strokeWidth="1" />
        </svg>

        {active ? (
          // Top-right: bars grow from the baseline, so this corner is the one
          // reliably free of marks.
          <div className="pointer-events-none absolute right-0 top-0 rounded-xl border border-panel-border bg-bg-elev/95 px-3 py-2 text-xs shadow-lg">
            <p className="font-medium">Week of {active.label}</p>
            {SERIES.map((s) => (
              <p key={s.key} className="mt-1 flex items-center gap-1.5 text-muted">
                <span className="h-2 w-2 rounded-[2px]" style={{ background: s.color }} aria-hidden />
                {s.name}: <span className="text-fg">{active[s.key]}</span>
              </p>
            ))}
          </div>
        ) : null}
      </div>

      {empty ? <p className="mt-3 text-center text-xs text-muted">No activity in this period yet.</p> : null}

      {/* Same numbers as a table, so the chart is never the only way to read them. */}
      <details className="mt-4">
        <summary className="cursor-pointer text-xs text-muted transition-colors hover:text-fg">View as table</summary>
        <table className="mt-3 w-full text-left text-xs">
          <thead className="text-muted">
            <tr>
              <th className="py-1 font-medium">Week of</th>
              <th className="py-1 text-right font-medium">Meetings</th>
              <th className="py-1 text-right font-medium">Tasks done</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {weeks.map((w) => (
              <tr key={w.label} className="border-t border-panel-border">
                <td className="py-1.5">{w.label}</td>
                <td className="py-1.5 text-right">{w.meetings}</td>
                <td className="py-1.5 text-right">{w.tasksDone}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
