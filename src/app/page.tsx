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

// Every line on this page is written to be skimmed, not read. A headline
// carries the point; the line under it is there for anyone who slows down.

const STEPS = [
  { title: "Hit record, pick a window", body: "Tick “Share audio”. Nothing joins the call." },
  { title: "Talk normally", body: "Recorded in your browser, backed up as you go." },
  { title: "Get notes and tasks", body: "Summary, owners, decisions, who to chase." },
  { title: "Approve the follow-up", body: "Tickets and emails drafted. Nothing leaves until you say yes." },
];

const FEATURES = [
  { title: "No bot in your meeting", body: "Records on your machine. Nothing to admit, nothing to explain." },
  { title: "Real tickets, not a to-do list", body: "Action items become proper Linear or Jira issues." },
  { title: "Nothing sends itself", body: "Every draft waits for you. No setting turns that off." },
  { title: "Says when it doesn’t know", body: "A missing owner stays blank. It never guesses a name." },
  { title: "Decisions, kept", body: "What was decided and why, searchable across every meeting." },
  { title: "Yours, and deletable", body: "Delete a meeting and the audio is gone for good." },
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

/** The "you get this" tick on a pricing line. Green on Pro, quiet on Free. */
function Check({ strong }: { strong: boolean }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`mt-[0.2rem] shrink-0 ${strong ? "text-ok" : "text-faint"}`}
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
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
            It listens to the call, writes the notes, pulls out every task, then drafts the tickets and emails.
            You read them and say yes.
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
        <p className="mt-4 max-w-xl leading-relaxed text-muted">
          If the sound comes out of your computer, it can be recorded. Chrome and Edge, nothing to install.
        </p>
      </section>

      {/* ---------- steps: a strip you scan across, not a list you read down ---------- */}
      <section id="how" className="mt-24 scroll-mt-20">
        <Heading>Four steps</Heading>
        <ol className="mt-8 grid gap-x-8 gap-y-8 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s, i) => (
            <li key={s.title} className="border-t border-panel-border pt-4">
              <span className="font-display text-4xl font-semibold leading-none text-accent">{i + 1}</span>
              <h3 className="mt-3 font-semibold leading-snug">{s.title}</h3>
              <p className="mt-1 text-sm leading-relaxed text-muted">{s.body}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* ---------- features: six headlines, one line each ---------- */}
      <section id="features" className="mt-24 scroll-mt-20">
        <Heading>What it actually does</Heading>
        <div className="mt-8 grid gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="border-t border-panel-border pt-4">
              <h3 className="font-display text-lg font-semibold leading-snug tracking-tight">{f.title}</h3>
              <p className="mt-1 text-sm leading-relaxed text-muted">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ---------- connects to ---------- */}
      <section className="mt-24">
        <Heading>Where the work ends up</Heading>
        <p className="mt-3 max-w-xl leading-relaxed text-muted">
          One click each, and the narrowest permission that does the job.
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
        <p className="mt-3 max-w-xl leading-relaxed text-muted">One price, everything included. No seat minimum.</p>

        <div className="mt-8 grid gap-4 sm:grid-cols-2 sm:items-start">
          {PLANS.map((plan) => {
            const pro = plan.highlight;
            const card = (
              <div
                className={`flex h-full flex-col rounded-xl border p-6 sm:p-7 ${
                  pro ? "border-accent/70 bg-panel-hi" : "border-panel-border bg-panel"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-display text-2xl font-semibold tracking-tight">{plan.name}</h3>
                  {pro ? <span className="pill pill-live">Most teams pick this</span> : null}
                </div>
                <p className="mt-1 text-sm text-muted">{plan.tagline}</p>

                <p className="mt-6 flex items-baseline gap-1">
                  <span className={`font-display font-semibold tracking-tight ${pro ? "text-6xl" : "text-5xl"}`}>{plan.price}</span>
                  {plan.cadence ? <span className="text-lg text-muted">{plan.cadence}</span> : null}
                </p>
                <p className="mt-0.5 text-sm text-faint">{plan.note}</p>

                <p className={`mt-6 text-sm ${pro ? "font-medium text-fg" : "text-muted"}`}>{plan.lead}</p>
                <ul className="mt-3 flex flex-1 flex-col gap-2.5">
                  {plan.features.map((f) => (
                    <li key={f} className="flex gap-2.5 text-sm leading-snug">
                      <Check strong={pro} />
                      {f}
                    </li>
                  ))}
                </ul>

                <Link href="/login" className={`btn mt-7 justify-center ${pro ? "btn-primary" : "btn-ghost"}`}>
                  {plan.cta}
                </Link>
                {pro ? <p className="mt-2.5 text-center text-xs text-faint">Your first three meetings are free.</p> : null}
              </div>
            );
            return pro ? (
              <Tilt key={plan.id} max={5}>
                {card}
              </Tilt>
            ) : (
              <div key={plan.id}>{card}</div>
            );
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
