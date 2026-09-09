import Link from "next/link";
import { BrandMark } from "@/components/brand-marks";
import { HeroDemo } from "@/components/hero-demo";
import { Tilt } from "@/components/tilt";
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

/** A still waveform, used as a rule between sections. Fixed heights: nothing on this page is random. */
const RULE = [3, 6, 11, 18, 9, 14, 22, 12, 7, 16, 25, 10, 5, 13, 20, 8, 15, 24, 11, 6, 17, 9, 21, 12, 4, 14, 19, 7, 10, 23, 13, 5, 16, 8, 20, 11, 6, 15, 9, 12];

function WaveRule() {
  return (
    <div aria-hidden className="wave-rule my-20">
      {RULE.map((h, i) => (
        <i key={i} style={{ height: `${h}px` }} />
      ))}
    </div>
  );
}

function Heading({ children }: { children: React.ReactNode }) {
  return <h2 className="font-display text-3xl font-semibold tracking-[-0.02em] text-balance sm:text-4xl">{children}</h2>;
}

export default function Home() {
  return (
    <>
      {/* ---------- hero: the pitch on the left, the product running on the right ---------- */}
      <section className="grid gap-10 pt-14 sm:pt-20 lg:grid-cols-[0.95fr_1.05fr] lg:items-center lg:gap-12">
        <div className="flex flex-col items-start gap-6">
          <span className="pill">No bot joins your call</span>

          <h1 className="font-display text-5xl font-semibold leading-[0.98] tracking-[-0.035em] text-balance sm:text-6xl lg:text-[4.5rem]">
            Record the meeting.
            <br />
            <span className="text-muted">Get the work done.</span>
          </h1>

          <p className="max-w-lg text-lg leading-relaxed text-muted">
            It listens to the call, writes the notes, pulls out every task and decision, then drafts the
            tickets and emails. All that is left for you is to read them and say yes.
          </p>

          <div className="mt-1 flex flex-wrap items-center gap-3">
            <Link href="/login" className="btn btn-primary">Try it on your next call</Link>
            <a href="#how" className="btn btn-ghost">See how it works</a>
          </div>

          <p className="text-sm text-faint">Free for your first three meetings. No card, no install.</p>
        </div>

        <div className="flex flex-col gap-2">
          <HeroDemo />
          <p className="text-xs text-faint">
            That is a real loop of what happens. Press <span className="text-muted">Approve</span> if you can&apos;t wait.
          </p>
        </div>
      </section>

      <WaveRule />

      {/* ---------- works with ---------- */}
      <section>
        <p className="text-sm text-faint">Works on whatever you already use</p>
        <ul className="mt-3 flex flex-wrap gap-x-7 gap-y-2">
          {WORKS_WITH.map((w) => (
            <li key={w} className="font-display text-xl font-medium">{w}</li>
          ))}
        </ul>
        <p className="mt-4 max-w-2xl leading-relaxed text-muted">
          There is no integration to set up, because there is nothing to integrate with. If the sound comes out
          of your computer, it can be recorded. Runs in Chrome and Edge, with nothing to install.
        </p>
      </section>

      {/* ---------- steps ---------- */}
      <section id="how" className="mt-24 scroll-mt-20">
        <Heading>Four steps, then it is someone else&apos;s turn</Heading>
        <ol className="mt-8 grid gap-px overflow-hidden rounded-xl border border-panel-border bg-panel-border sm:grid-cols-2">
          {STEPS.map((s, i) => (
            <li key={s.title} className="flex gap-4 bg-panel p-6">
              <span className="font-display text-3xl font-semibold leading-none text-faint">{i + 1}</span>
              <div>
                <h3 className="font-semibold">{s.title}</h3>
                <p className="mt-1.5 leading-relaxed text-muted">{s.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* ---------- features: a list, not a wall of cards ---------- */}
      <section id="features" className="mt-24 scroll-mt-20">
        <Heading>What it actually does</Heading>
        <div className="mt-6 grid gap-x-12 sm:grid-cols-2">
          {FEATURES.map((f) => (
            <div key={f.title} className="border-t border-panel-border py-6">
              <h3 className="font-display text-xl font-semibold tracking-tight">{f.title}</h3>
              <p className="mt-2 leading-relaxed text-muted">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ---------- connects to ---------- */}
      <section className="mt-24">
        <Heading>Where the work ends up</Heading>
        <p className="mt-3 max-w-2xl leading-relaxed text-muted">
          Connect what your team already uses. Each one takes a single click and asks for the narrowest
          permission that does the job.
        </p>
        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          {CONNECTS.map((c) => (
            <div key={c.provider} className="glass glass-hover flex items-center gap-4 p-5">
              <BrandMark provider={c.provider} />
              <div className="min-w-0">
                <h3 className="font-semibold">{c.name}</h3>
                <p className="mt-0.5 text-sm leading-relaxed text-muted">{c.body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <WaveRule />

      {/* ---------- pricing ---------- */}
      <section id="pricing" className="scroll-mt-20">
        <Heading>Pricing</Heading>
        <p className="mt-3 max-w-2xl leading-relaxed text-muted">
          One price, everything included. No per-integration upsell and no seat minimum.
        </p>

        <div className="mt-8 grid gap-4 sm:grid-cols-2 sm:items-start">
          {PLANS.map((plan) => {
            const card = (
              <div className={`glass flex h-full flex-col p-6 ${plan.highlight ? "border-accent/50" : ""}`}>
                <div className="flex items-center gap-2">
                  <h3 className="font-display text-2xl font-semibold tracking-tight">{plan.name}</h3>
                  {plan.highlight ? <span className="pill pill-live">Most teams</span> : null}
                </div>
                <p className="mt-1 text-sm text-muted">{plan.tagline}</p>

                <p className="mt-5 flex items-baseline gap-1.5">
                  <span className="font-display text-5xl font-semibold tracking-tight">{plan.price}</span>
                  <span className="text-sm text-faint">{plan.cadence}</span>
                </p>

                <ul className="mt-5 flex flex-1 flex-col gap-2">
                  {plan.features.map((f) => (
                    <li key={f} className="flex gap-2.5 text-sm leading-relaxed">
                      <span aria-hidden className={`mt-[0.45rem] h-1.5 w-1.5 shrink-0 rounded-full ${plan.highlight ? "bg-work" : "bg-faint"}`} />
                      {f}
                    </li>
                  ))}
                </ul>

                <Link href="/login" className={`btn mt-6 justify-center ${plan.highlight ? "btn-primary" : "btn-ghost"}`}>
                  {plan.cta}
                </Link>
              </div>
            );
            return plan.highlight ? <Tilt key={plan.id} max={5}>{card}</Tilt> : <div key={plan.id}>{card}</div>;
          })}
        </div>
      </section>

      {/* ---------- about ---------- */}
      <section id="about" className="mt-24 scroll-mt-20">
        <Heading>About</Heading>
        <div className="mt-6 flex max-w-2xl flex-col gap-4 text-[1.0625rem] leading-relaxed text-muted">
          <p>
            Every team has the same meeting. Somebody agrees to do a thing, everybody nods, and three weeks
            later nobody can remember who said it or whether it was ever written down.
          </p>
          <p>
            Plenty of tools will transcribe that meeting for you. Fewer will turn what was said into work that
            exists somewhere your team actually looks. The ones that do tend to either send a bot into your
            call, or file tickets automatically and leave you cleaning up after a model that misheard a name.
          </p>
          <p>
            From the Call is built around the opposite trade. Nothing joins your meeting, and nothing is sent,
            filed or emailed until a person has read it and said yes. The drafting is done by a model because
            understanding language is what models are for. Everything else is ordinary code that behaves the
            same way every time.
          </p>
          <p className="text-fg">
            It is built and run by one person, which is why you can email and get a reply from someone who can
            actually change the product.
          </p>
        </div>
      </section>

      {/* ---------- contact ---------- */}
      <section id="contact" className="mt-24 scroll-mt-20">
        <Heading>Contact</Heading>
        <div className="glass mt-6 flex flex-wrap items-center justify-between gap-4 p-6">
          <div>
            <p className="font-medium">Questions, problems, or something you wish it did</p>
            <p className="mt-1 text-sm text-muted">Feature requests from early users are the ones that get built.</p>
          </div>
          <a className="btn btn-ghost" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
        </div>
      </section>

      {/* ---------- last word ---------- */}
      <section className="mt-24">
        <div className="glass flex flex-col items-start gap-4 p-8 sm:p-10">
          <h2 className="font-display max-w-xl text-3xl font-semibold leading-[1.05] tracking-[-0.02em] text-balance sm:text-4xl">
            You have a call today. Try it on that one.
          </h2>
          <p className="max-w-lg leading-relaxed text-muted">
            Three meetings free, no card. If the notes are not better than what you would have written yourself,
            you have lost ten minutes.
          </p>
          <Link href="/login" className="btn btn-primary">Try it on your next call</Link>
        </div>
      </section>
    </>
  );
}
