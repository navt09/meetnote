import Link from "next/link";

const STEPS = [
  { n: "01", title: "Pick a window", body: "Hit record and choose the window your meeting is in. Tick “Share audio”. Nothing joins the call." },
  { n: "02", title: "We listen", body: "Your mic and the meeting audio are mixed and recorded right in the browser, backed up as you go." },
  { n: "03", title: "Notes and tasks", body: "A summary, action items with owners, decisions, and who to follow up with. Saved to your account." },
];

export default function Home() {
  return (
    <>
      <section className="flex flex-col items-start gap-7 pt-20 sm:pt-28">
        <span className="pill pill-live rise">
          <span className="rec-dot rec-dot-accent !h-1.5 !w-1.5" />
          No bot joins your call
        </span>

        <h1 className="rise max-w-2xl text-5xl font-semibold leading-[1.03] tracking-tight sm:text-6xl" style={{ animationDelay: "60ms" }}>
          Record the meeting.
          <br />
          <span className="grad-text">Get the work done.</span>
        </h1>

        <p className="rise max-w-xl text-lg leading-relaxed text-muted" style={{ animationDelay: "120ms" }}>
          Meetnote captures the audio, writes the notes, pulls out every task and decision,
          and drafts the follow-ups for you to approve.
        </p>

        <div className="rise flex flex-wrap gap-3" style={{ animationDelay: "180ms" }}>
          <Link href="/record" className="btn btn-primary">Start recording</Link>
          <a href="#how" className="btn btn-ghost">How it works</a>
        </div>
      </section>

      <section id="how" className="stagger mt-24 grid w-full gap-4 sm:grid-cols-3">
        {STEPS.map((s) => (
          <div key={s.n} className="glass glass-lit glass-hover p-6">
            <span className="font-mono text-xs tracking-widest text-accent">{s.n}</span>
            <h3 className="mt-3 font-semibold">{s.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted">{s.body}</p>
          </div>
        ))}
      </section>

      <section className="rise mt-6 grid gap-4 sm:grid-cols-3">
        {[
          ["Chrome & Edge", "No install, no extension"],
          ["Yours only", "Private to your account"],
          ["Delete any time", "Audio and notes, gone"],
        ].map(([t, b]) => (
          <div key={t} className="glass flex items-center gap-3 p-4">
            <span className="grid h-8 w-8 flex-none place-items-center rounded-lg bg-gradient-to-br from-accent/25 to-accent-2/25 text-sm">✓</span>
            <span>
              <span className="block text-sm font-medium">{t}</span>
              <span className="block text-xs text-muted">{b}</span>
            </span>
          </div>
        ))}
      </section>
    </>
  );
}
