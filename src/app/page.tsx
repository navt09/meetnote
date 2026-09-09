import Link from "next/link";
import { BrandMark } from "@/components/brand-marks";
import { CONTACT_EMAIL, PLANS, WORKS_WITH } from "@/lib/site";

export const metadata = {
  title: "From the Call · Meeting notes that do the follow-up",
  description:
    "Record any meeting without a bot joining it. Get notes, action items, and drafted tickets and emails you approve before anything is sent.",
};

const STEPS = [
  {
    title: "Hit record and pick a window",
    body: "Choose the window your meeting is in and tick “Share audio”. Nothing joins the call, nobody gets an email saying a notetaker has arrived, and the other side sees no extra participant.",
  },
  {
    title: "Talk normally",
    body: "Your microphone and the meeting audio are mixed and recorded in your browser, backed up every few seconds. Close the tab by accident and the recording is still there when you come back.",
  },
  {
    title: "Get the notes and the task list",
    body: "A summary, every action item with who owns it, the decisions that were actually made, and the people the meeting said to follow up with.",
  },
  {
    title: "Approve the follow-up",
    body: "Tickets and emails are written for you from what was said. You read them, edit anything, and approve. Only then does anything leave.",
  },
];

const FEATURES = [
  {
    title: "No bot in your meeting",
    body: "Most notetakers dial in as a participant. Yours records the audio on your machine, so there is nothing to admit, nothing to explain, and nothing that gets blocked by an IT policy.",
  },
  {
    title: "Real tickets, not a to-do list",
    body: "An action item becomes a properly written Linear or Jira issue with context and acceptance criteria, created in your tracker once you approve it.",
  },
  {
    title: "Nothing sends itself",
    body: "Every draft waits for a person. There is no setting that turns that off and no code path that skips it, because a wrong ticket filed automatically costs more than it saves.",
  },
  {
    title: "It says when it does not know",
    body: "If the meeting never said who owns something, the draft says so rather than inventing a name. Guessed detail is worse than a gap you can see.",
  },
  {
    title: "Decisions, kept",
    body: "The thing nobody writes down and everyone argues about six weeks later. Captured with the reasoning, searchable across every meeting you have run.",
  },
  {
    title: "Yours, and deletable",
    body: "Recordings and notes are private to your account. Delete a meeting and the audio goes with it, immediately and for good.",
  },
];

const CONNECTS = [
  { provider: "linear" as const, name: "Linear", body: "Approved tickets become issues in the team you choose." },
  { provider: "jira" as const, name: "Jira", body: "Approved tickets become issues in your project." },
  { provider: "slack" as const, name: "Slack", body: "Summaries posted to the channel you pick." },
  { provider: "google" as const, name: "Google", body: "Send follow-ups from your Gmail, block tasks out on your calendar." },
];

export default function Home() {
  return (
    <>
      {/* ---------- hero ---------- */}
      <section className="flex max-w-3xl flex-col items-start gap-6 pt-20 sm:pt-28">
        <span className="pill">No bot joins your call</span>

        <h1 className="text-4xl font-semibold leading-[1.08] tracking-tight sm:text-6xl">
          Record the meeting.
          <br />
          <span className="text-muted">Get the work done.</span>
        </h1>

        <p className="max-w-xl text-lg leading-relaxed text-muted">
          From the Call records any meeting, writes the notes, pulls out every task and decision, then
          drafts the tickets and emails so all that is left for you is to read them and say yes.
        </p>

        <div className="mt-1 flex flex-wrap items-center gap-3">
          <Link href="/login" className="btn btn-primary">Try it on your next call</Link>
          <a href="#how" className="btn btn-ghost">See how it works</a>
        </div>

        <p className="text-sm text-faint">Free for your first three meetings. No card, no install.</p>
      </section>

      {/* ---------- works with ---------- */}
      <section className="mt-20">
        <p className="text-sm text-faint">Works on whatever you already use</p>
        <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
          {WORKS_WITH.map((w) => (
            <li key={w} className="text-base font-medium">{w}</li>
          ))}
        </ul>
        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted">
          There is no integration to set up, because there is nothing to integrate with. If the sound comes
          out of your computer, it can be recorded. Runs in Chrome and Edge, with nothing to install.
        </p>
      </section>

      {/* ---------- steps ---------- */}
      <section id="how" className="mt-24 scroll-mt-20">
        <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Four steps, then it is someone else&apos;s turn</h2>
        <ol className="mt-8 flex flex-col gap-px overflow-hidden rounded-xl border border-panel-border bg-panel-border">
          {STEPS.map((s, i) => (
            <li key={s.title} className="flex gap-4 bg-panel p-6">
              <span className="step-dot mt-0.5 shrink-0">{i + 1}</span>
              <div>
                <h3 className="font-semibold">{s.title}</h3>
                <p className="mt-1.5 max-w-2xl leading-relaxed text-muted">{s.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* ---------- features ---------- */}
      <section id="features" className="mt-24 scroll-mt-20">
        <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">What it actually does</h2>
        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          {FEATURES.map((f) => (
            <div key={f.title} className="glass p-5">
              <h3 className="font-semibold">{f.title}</h3>
              <p className="mt-1.5 leading-relaxed text-muted">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ---------- connects to ---------- */}
      <section className="mt-24">
        <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Where the work ends up</h2>
        <p className="mt-2 max-w-2xl leading-relaxed text-muted">
          Connect what your team already uses. Each one takes a single click and asks for the narrowest
          permission that does the job.
        </p>
        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          {CONNECTS.map((c) => (
            <div key={c.provider} className="glass flex items-center gap-4 p-5">
              <BrandMark provider={c.provider} />
              <div className="min-w-0">
                <h3 className="font-semibold">{c.name}</h3>
                <p className="mt-0.5 text-sm leading-relaxed text-muted">{c.body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ---------- pricing ---------- */}
      <section id="pricing" className="mt-24 scroll-mt-20">
        <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Pricing</h2>
        <p className="mt-2 max-w-2xl leading-relaxed text-muted">
          One price, everything included. No per-integration upsell and no seat minimum.
        </p>

        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          {PLANS.map((plan) => (
            <div
              key={plan.id}
              className={`glass flex flex-col p-6 ${plan.highlight ? "border-accent/50" : ""}`}
            >
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-semibold">{plan.name}</h3>
                {plan.highlight ? <span className="pill pill-ok">Most teams</span> : null}
              </div>
              <p className="mt-1 text-sm text-muted">{plan.tagline}</p>

              <p className="mt-5 flex items-baseline gap-1.5">
                <span className="text-4xl font-semibold tracking-tight">{plan.price}</span>
                <span className="text-sm text-faint">{plan.cadence}</span>
              </p>

              <ul className="mt-5 flex flex-1 flex-col gap-2">
                {plan.features.map((f) => (
                  <li key={f} className="flex gap-2.5 text-sm leading-relaxed">
                    <span aria-hidden className="mt-[0.4rem] h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                    {f}
                  </li>
                ))}
              </ul>

              <Link
                href="/login"
                className={`btn mt-6 ${plan.highlight ? "btn-primary" : "btn-ghost"} justify-center`}
              >
                {plan.cta}
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* ---------- about ---------- */}
      <section id="about" className="mt-24 scroll-mt-20">
        <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">About</h2>
        <div className="mt-6 flex max-w-2xl flex-col gap-4 leading-relaxed text-muted">
          <p>
            Every team has the same meeting. Somebody agrees to do a thing, everybody nods, and three weeks
            later nobody can remember who said it or whether it was ever written down.
          </p>
          <p>
            Plenty of tools will transcribe that meeting for you. Fewer will turn what was said into work
            that exists somewhere your team actually looks. The ones that do tend to either send a bot into
            your call, or file tickets automatically and leave you cleaning up after a model that misheard
            a name.
          </p>
          <p>
            From the Call is built around the opposite trade. Nothing joins your meeting, and nothing is
            sent, filed or emailed until a person has read it and said yes. The drafting is done by a model
            because understanding language is what models are for. Everything else is ordinary code that
            behaves the same way every time.
          </p>
          <p className="text-fg">
            It is built and run by one person, which is why you can email and get a reply from someone who
            can actually change the product.
          </p>
        </div>
      </section>

      {/* ---------- contact ---------- */}
      <section id="contact" className="mt-24 scroll-mt-20">
        <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Contact</h2>
        <div className="glass mt-6 flex flex-wrap items-center justify-between gap-4 p-6">
          <div>
            <p className="font-medium">Questions, problems, or something you wish it did</p>
            <p className="mt-1 text-sm text-muted">
              Feature requests from early users are the ones that get built.
            </p>
          </div>
          <a className="btn btn-ghost" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
        </div>
      </section>

      {/* ---------- final call to action ---------- */}
      <section className="mt-24">
        <div className="glass flex flex-col items-start gap-4 p-8 sm:p-10">
          <h2 className="max-w-xl text-2xl font-semibold leading-tight tracking-tight sm:text-3xl">
            You have a call today. Try it on that one.
          </h2>
          <p className="max-w-lg leading-relaxed text-muted">
            Three meetings free, no card. If the notes are not better than what you would have written
            yourself, you have lost ten minutes.
          </p>
          <Link href="/login" className="btn btn-primary">Try it on your next call</Link>
        </div>
      </section>
    </>
  );
}
