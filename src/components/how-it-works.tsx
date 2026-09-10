"use client";

import { useEffect, useState } from "react";
import { useReducedMotion } from "@/lib/use-reduced-motion";

/**
 * The four steps, shown one at a time.
 *
 * A row of tabs across the top; the line above the current one fills over the
 * time it is on screen, then the next takes over. Pressing a tab jumps to it
 * and the clock starts again from there. Every picture below is hand-drawn
 * markup with fixed words: there is nothing random and nothing fetched, so the
 * server and the first client frame agree.
 *
 * Under prefers-reduced-motion the tabs stop rotating and wait to be pressed.
 */

const HOLD_MS = 6500;

export const STEPS = [
  {
    label: "Pick a window",
    sub: "Tick “Share audio”. Nothing joins the call.",
    body: "Press record and choose the window your meeting is in. Your browser does the recording, on your machine. Nobody on the call sees anything join.",
  },
  {
    label: "Talk normally",
    sub: "Recorded in your browser, backed up as you go.",
    body: "The meeting audio and your microphone are captured side by side, so the notes know which lines were yours. A copy is saved locally every few seconds in case the tab dies.",
  },
  {
    label: "Get notes and tasks",
    sub: "Summary, owners, decisions, who to chase.",
    body: "A few minutes after you stop, the meeting is a page: what was agreed, what needs doing and by whom, and the people someone promised to follow up with.",
  },
  {
    label: "Approve the follow-up",
    sub: "Tickets and emails drafted. Nothing leaves until you say yes.",
    body: "Each task becomes a drafted ticket; each person to contact gets a drafted email. You read, edit, and press Approve. There is no setting that sends without you.",
  },
] as const;

function Wave() {
  return (
    <span aria-hidden className="wave is-live">
      {Array.from({ length: 12 }, (_, i) => (
        <i key={i} style={{ "--i": i } as React.CSSProperties} />
      ))}
    </span>
  );
}

/* ---------- step 1: the share dialog ---------- */
function PickWindow() {
  const windows = ["Zoom Meeting", "Slack", "Figma", "Terminal"];
  return (
    <div className="glass overflow-hidden text-sm">
      <div className="border-b border-panel-border px-4 py-3">
        <p className="font-medium">Choose what to share</p>
        <div className="mt-2.5 flex gap-1.5 text-xs">
          <span className="rounded-md border border-panel-border px-2 py-1 text-muted">Chrome tab</span>
          <span className="rounded-md border border-fg px-2 py-1 font-medium">Window</span>
          <span className="rounded-md border border-panel-border px-2 py-1 text-muted">Entire screen</span>
        </div>
      </div>
      <ul className="grid grid-cols-2 gap-2 p-4 sm:grid-cols-4">
        {windows.map((w, i) => (
          <li
            key={w}
            className={`rounded-lg border p-2 ${i === 0 ? "border-fg bg-panel-hi" : "border-panel-border"}`}
          >
            <div className="h-10 rounded bg-panel-hi" />
            <p className={`mt-1.5 truncate text-xs ${i === 0 ? "font-medium" : "text-muted"}`}>{w}</p>
          </li>
        ))}
      </ul>
      <div className="flex items-center justify-between gap-3 border-t border-panel-border px-4 py-3">
        <label className="flex items-center gap-2 text-xs">
          <span className="grid h-4 w-4 place-items-center rounded border border-fg bg-fg text-[0.6rem] text-bg">✓</span>
          Share audio
        </label>
        <div className="flex gap-2">
          <span className="btn btn-ghost !py-1 text-xs">Cancel</span>
          <span className="btn btn-primary !py-1 text-xs">Share</span>
        </div>
      </div>
    </div>
  );
}

/* ---------- step 2: the meeting, being recorded ---------- */
function Talk() {
  const lines = [
    { who: "Maya", text: "Staging fell over again last night. Same cache thing.", you: false },
    { who: "You", text: "I'll fix the CI cache step today, it's the restore key.", you: true },
    { who: "Maya", text: "Can invoice export ship by Thursday?", you: false },
    { who: "Priya", text: "Yes. PR up by Wednesday, I'll tag you for review.", you: false },
  ];
  return (
    <div className="glass p-4 text-sm">
      <div className="flex items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-xs text-muted">
          <span aria-hidden className="rec-dot" />
          Recording · 12:40
        </p>
        <Wave />
      </div>
      <ol className="mt-4 flex flex-col gap-2.5 font-mono text-[0.8125rem] leading-relaxed">
        {lines.map((l, i) => (
          <li key={i}>
            <span className={l.you ? "text-accent" : "text-fg"}>{l.who}</span>
            <span className="text-faint"> · </span>
            <span className="text-muted">{l.text}</span>
          </li>
        ))}
      </ol>
      <div className="mt-4 flex flex-wrap gap-2 text-xs">
        <span className="pill">Meeting audio + your mic</span>
        <span className="pill pill-ok">Backed up on this machine</span>
      </div>
    </div>
  );
}

/* ---------- step 3: the notes page, in miniature ---------- */
function Notes() {
  return (
    <div className="grid gap-3 text-sm sm:grid-cols-2">
      <section className="band band-work">
        <div className="band-head">
          <h4 className="band-title">Needs doing</h4>
          <span className="band-count">2</span>
        </div>
        <ul className="band-body">
          <li className="band-row">
            <div className="flex items-start justify-between gap-2">
              <p className="font-medium leading-snug">Fix CI cache restore key</p>
              <span className="flag flag-high">High</span>
            </div>
            <p className="mt-1 text-xs text-muted">You · today</p>
          </li>
          <li className="band-row">
            <div className="flex items-start justify-between gap-2">
              <p className="font-medium leading-snug">Invoice export PR for review</p>
              <span className="flag flag-med">Medium</span>
            </div>
            <p className="mt-1 text-xs text-muted">Priya · Wednesday</p>
          </li>
        </ul>
      </section>
      <div className="flex flex-col gap-3">
        <section className="band band-agreed">
          <div className="band-head">
            <h4 className="band-title">Agreed</h4>
            <span className="band-count">1</span>
          </div>
          <ul className="band-body">
            <li className="band-row">
              <p className="font-medium leading-snug">Invoice export ships Thursday</p>
              <p className="mt-1 text-xs text-muted">Priya has the PR up a day early for review.</p>
            </li>
          </ul>
        </section>
        <section className="band band-people">
          <div className="band-head">
            <h4 className="band-title">People to contact</h4>
            <span className="band-count">1</span>
          </div>
          <ul className="band-body">
            <li className="band-row">
              <p className="font-medium leading-snug">
                Sam <span className="font-normal text-faint">· Acme</span>
              </p>
              <p className="mt-1 text-xs text-muted">Needs warning about the API change.</p>
            </li>
          </ul>
        </section>
      </div>
    </div>
  );
}

/* ---------- step 4: the approval gate ---------- */
function Approve() {
  return (
    <div className="grid gap-3 text-sm sm:grid-cols-2">
      <div className="glass p-4">
        <div className="flex items-center justify-between gap-2">
          <span className="pill" style={{ color: "var(--work)", borderColor: "var(--work-line)" }}>Linear · ENG</span>
          <span className="text-xs text-faint">Draft</span>
        </div>
        <p className="mt-2.5 font-semibold leading-snug">Fix CI cache restore key on staging</p>
        <p className="mt-1 text-xs leading-relaxed text-muted">
          Staging deploy failed overnight. Traced to a stale cache restore key. Done when a deploy passes twice with a warm cache.
        </p>
        <div className="mt-3 flex items-center justify-between gap-2">
          <span className="text-xs text-faint">You · today</span>
          <span className="btn btn-primary pulse-ring !py-1 text-xs">Approve</span>
        </div>
      </div>
      <div className="glass p-4">
        <div className="flex items-center justify-between gap-2">
          <span className="pill pill-live">Gmail · to Sam at Acme</span>
          <span className="text-xs text-faint">Draft</span>
        </div>
        <p className="mt-2.5 font-semibold leading-snug">Heads-up on the API change</p>
        <p className="mt-1 text-xs leading-relaxed text-muted">
          Hi Sam, we talked today about a change to the export API landing next sprint. Nothing breaks on your side, but the
          date field is moving. Happy to walk through it.
        </p>
        <div className="mt-3 flex items-center justify-between gap-2">
          <span className="text-xs text-faint">Edit before it goes</span>
          <span className="btn btn-ghost !py-1 text-xs">Approve</span>
        </div>
      </div>
    </div>
  );
}

const STAGES = [PickWindow, Talk, Notes, Approve];

export function HowItWorks() {
  const reduce = useReducedMotion();
  const [active, setActive] = useState(0);
  // Changes with every selection, even a re-selection, so the line restarts.
  const [run, setRun] = useState(0);

  useEffect(() => {
    if (reduce) return;
    const id = setTimeout(() => {
      setActive((a) => (a + 1) % STEPS.length);
      setRun((r) => r + 1);
    }, HOLD_MS);
    return () => clearTimeout(id);
  }, [active, run, reduce]);

  function pick(i: number) {
    setActive(i);
    setRun((r) => r + 1);
  }

  const Stage = STAGES[active];
  const step = STEPS[active];

  return (
    <div>
      <div role="tablist" aria-label="How it works" className="grid grid-cols-2 gap-x-4 gap-y-2 md:grid-cols-4 md:gap-x-6">
        {STEPS.map((s, i) => (
          <button
            key={s.label}
            role="tab"
            type="button"
            aria-selected={i === active}
            aria-controls="how-stage"
            onClick={() => pick(i)}
            className="tab"
            style={{ "--tab-ms": `${HOLD_MS}ms` } as React.CSSProperties}
          >
            <span className="tab-track">
              <span key={i === active ? run : -1} className="tab-fill" />
            </span>
            <span className="mt-3 block font-mono text-xs text-faint">0{i + 1}</span>
            <span className="mt-1 block font-medium leading-snug">{s.label}</span>
            <span className="mt-0.5 hidden text-xs leading-snug text-muted md:block">{s.sub}</span>
          </button>
        ))}
      </div>

      <div id="how-stage" role="tabpanel" className="mt-10 grid gap-8 md:grid-cols-[0.8fr_1.2fr] md:items-center md:gap-12">
        <div key={`t${active}`} className="stage-in">
          <p className="eyebrow">Step {active + 1} of {STEPS.length}</p>
          <h3 className="display mt-3 text-3xl sm:text-4xl">{step.label}</h3>
          <p className="mt-4 max-w-md leading-relaxed text-muted">{step.body}</p>
        </div>
        <div key={`s${active}`} className="stage-in min-h-[17rem]">
          <Stage />
        </div>
      </div>
    </div>
  );
}
