import Link from "next/link";

export default function Home() {
  return (
    <section className="flex flex-col items-start gap-8 pt-20">
      <span className="pill">No bot joins your call</span>
      <h1 className="max-w-2xl text-5xl font-semibold leading-[1.05] tracking-tight">
        Record the meeting.
        <br />
        <span className="bg-gradient-to-r from-accent to-accent-2 bg-clip-text text-transparent">
          Get the work done.
        </span>
      </h1>
      <p className="max-w-xl text-lg text-muted">
        Pick the window your meeting is in. Meetnote captures the audio, writes the notes,
        pulls out every task and decision, and drafts the follow-ups for you to approve.
      </p>
      <div className="flex gap-3">
        <Link href="/record" className="btn btn-primary">Start recording</Link>
        <a href="#how" className="btn btn-ghost">How it works</a>
      </div>

      <div id="how" className="mt-16 grid w-full gap-4 sm:grid-cols-3">
        {[
          ["1. Choose a window", "Click Record, pick your Zoom, Teams, or Meet window, tick “Share audio”."],
          ["2. We listen", "Your mic and the meeting audio are mixed and recorded locally in the browser."],
          ["3. Notes and tasks", "Stop, and get a summary, action items with owners, decisions, and people to follow up with."],
        ].map(([title, body]) => (
          <div key={title} className="glass p-5">
            <h3 className="mb-2 font-semibold">{title}</h3>
            <p className="text-sm text-muted">{body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
