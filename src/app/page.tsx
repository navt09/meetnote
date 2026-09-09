import Link from "next/link";

const STEPS = [
  { n: "1", title: "Pick a window", body: "Hit record and choose the window your meeting is in. Tick “Share audio”. Nothing joins the call." },
  { n: "2", title: "We listen", body: "Your mic and the meeting audio are mixed and recorded in the browser, backed up as you go." },
  { n: "3", title: "Notes and tasks", body: "A summary, action items with owners, decisions, and who to follow up with. Saved to your account." },
];

export default function Home() {
  return (
    <>
      <section className="flex max-w-2xl flex-col items-start gap-6 pt-24 sm:pt-32">
        <span className="pill">No bot joins your call</span>

        <h1 className="text-4xl font-semibold leading-[1.1] tracking-tight sm:text-5xl">
          Record the meeting.
          <br />
          <span className="text-muted">Get the work done.</span>
        </h1>

        <p className="max-w-lg leading-relaxed text-muted">
          From the Call captures the audio, writes the notes, pulls out every task and decision,
          and drafts the follow-ups for you to approve.
        </p>

        <div className="mt-1 flex flex-wrap gap-2">
          <Link href="/record" className="btn btn-primary">Start recording</Link>
          <a href="#how" className="btn btn-ghost">How it works</a>
        </div>
      </section>

      <section id="how" className="mt-24 grid w-full gap-px overflow-hidden rounded-xl border border-panel-border bg-panel-border sm:grid-cols-3">
        {STEPS.map((s) => (
          <div key={s.n} className="bg-panel p-6">
            <span className="font-mono text-xs text-faint">{s.n}</span>
            <h3 className="mt-2 text-sm font-semibold">{s.title}</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-muted">{s.body}</p>
          </div>
        ))}
      </section>

      <section className="mt-4 grid gap-2 sm:grid-cols-3">
        {[
          ["Chrome and Edge", "No install, no extension"],
          ["Yours only", "Private to your account"],
          ["Delete any time", "Audio and notes, gone"],
        ].map(([t, b]) => (
          <div key={t} className="glass p-4">
            <p className="text-sm font-medium">{t}</p>
            <p className="mt-0.5 text-xs text-muted">{b}</p>
          </div>
        ))}
      </section>
    </>
  );
}
