import Link from "next/link";
import { BrandMark } from "@/components/brand-marks";
import { HeroDemo } from "@/components/hero-demo";
import { HowItWorks } from "@/components/how-it-works";
import { Reveal } from "@/components/reveal";
import { Tilt } from "@/components/tilt";
import { CONTACT_EMAIL, PLANS, WORKS_WITH } from "@/lib/site";

export const metadata = {
  title: "From the Call · Meeting notes that do the follow-up",
  description:
    "Record any meeting without a bot joining it. Get notes, action items, and drafted tickets and emails you approve before anything is sent.",
};

/*
 * The shopfront, as a run of full-width bands: ink, paper, ink, paper, ink.
 * Each band has one job and opens the same way, a title on the left and the
 * one thing to do on the right, so a visitor always knows where they are.
 * Every line is written to be skimmed; the sentence under a headline is for
 * whoever slows down.
 */

const FEATURE_GROUPS = [
  {
    eyebrow: "In the meeting",
    items: [
      { title: "No bot in your meeting", body: "Records on your machine. Nothing to admit, nothing to explain." },
      { title: "Knows which lines were yours", body: "Your mic and the meeting are heard separately, so the notes are written for you." },
    ],
  },
  {
    eyebrow: "After it",
    items: [
      { title: "Real tickets, not a to-do list", body: "Action items become proper Linear or Jira issues." },
      { title: "Decisions, kept", body: "What was decided and why, searchable across every meeting." },
    ],
  },
  {
    eyebrow: "Always",
    items: [
      { title: "Nothing sends itself", body: "Every draft waits for you. No setting turns that off." },
      { title: "Says when it doesn’t know", body: "A missing owner stays blank. It never guesses a name." },
      { title: "Yours, and deletable", body: "Delete a meeting and the audio is gone for good." },
    ],
  },
];

const CONNECTS = [
  { provider: "linear" as const, name: "Linear", body: "Approved tickets become issues in the team you choose." },
  { provider: "jira" as const, name: "Jira", body: "Approved tickets become issues in your project." },
  { provider: "slack" as const, name: "Slack", body: "Summaries posted to the channel you pick." },
  { provider: "google" as const, name: "Google", body: "Follow-ups from your Gmail, tasks on your calendar." },
];

function SectionHead({
  eyebrow,
  title,
  action,
}: {
  eyebrow: string;
  title: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="sec-head">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h2 className="display mt-3 text-4xl sm:text-[2.75rem]">{title}</h2>
      </div>
      {action ? <div className="hidden shrink-0 sm:block">{action}</div> : null}
    </div>
  );
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
      {/* ================= ink: the pitch, then the product running ================= */}
      <section className="wrap pt-16 sm:pt-24">
        <div className="hero-in mx-auto flex max-w-3xl flex-col items-center text-center">
          <p className="eyebrow">No bot joins your call</p>
          <h1 className="display mt-5 text-[2.75rem] sm:text-6xl lg:text-[4.75rem]">
            Record the meeting.
            <br />
            Get the work done.
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted">
            It listens to the call, writes the notes, pulls out every task, then drafts the tickets and emails.
            You read them and say yes.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link href="/login" className="btn btn-primary">Try it on your next call</Link>
            <a href="#how" className="btn btn-ghost">See how it works</a>
          </div>
          <p className="mt-4 text-sm text-faint">Two meetings a month, free. No card, no install.</p>
        </div>

        <div className="hero-in mt-14 sm:mt-20">
          <div>
            <HeroDemo />
            <p className="mt-3 text-center text-xs text-faint">
              A real loop of what happens. Press <span className="text-muted">Approve</span> if you can&apos;t wait.
            </p>
          </div>
        </div>

        {/* where the work ends up: the part nobody else does, so it comes first */}
        <Reveal className="mt-20 sm:mt-24">
          <SectionHead
            eyebrow="Where the work ends up"
            title={
              <>
                Approve it once.
                <br />
                It lands where your team already looks.
              </>
            }
            action={<a href="#how" className="btn btn-ghost">See how it works</a>}
          />
        </Reveal>
        <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {CONNECTS.map((c, i) => (
            <Reveal key={c.provider} delay={i * 70} className="h-full">
              <div className="glass glass-hover flex h-full flex-col gap-4 p-5">
                <BrandMark provider={c.provider} />
                <div>
                  <h3 className="font-semibold">{c.name}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-muted">{c.body}</p>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
        <p className="mt-4 text-sm text-faint">One click to connect each, with the narrowest permission that does the job. Nothing is sent until you press Approve.</p>

        {/* works with */}
        <Reveal className="mt-16 sm:mt-20">
          <p className="text-center text-sm text-faint">Works on whatever you already use. Chrome and Edge, nothing to install.</p>
          <ul className="cells mt-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
            {WORKS_WITH.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </Reveal>
      </section>

      {/* ================= paper: how it works ================= */}
      <section id="how" className="light mt-20 scroll-mt-14 py-20 sm:mt-24 sm:py-24">
        <div className="wrap">
          <Reveal>
            <SectionHead
              eyebrow="How it works"
              title={
                <>
                  Four steps.
                  <br />
                  You only do two of them.
                </>
              }
              action={<Link href="/login" className="btn btn-primary">Try it free</Link>}
            />
          </Reveal>
          <Reveal className="mt-10" delay={80}>
            <HowItWorks />
          </Reveal>
        </div>
      </section>

      {/* ================= ink: what it does ================= */}
      <section id="features" className="scroll-mt-14 py-20 sm:py-24">
        <div className="wrap">
          <Reveal>
            <SectionHead
              eyebrow="What it does"
              title={
                <>
                  Built for the meeting
                  <br />
                  you actually have.
                </>
              }
              action={<a href="#pricing" className="btn btn-ghost">See pricing</a>}
            />
          </Reveal>

          <div className="mt-10 grid gap-x-8 gap-y-10 md:grid-cols-3">
            {FEATURE_GROUPS.map((g, gi) => (
              <Reveal key={g.eyebrow} delay={gi * 90}>
                <p className="eyebrow">{g.eyebrow}</p>
                <ul className="mt-4 flex flex-col gap-2.5">
                  {g.items.map((f) => (
                    <li key={f.title} className="glass glass-hover p-4">
                      <h3 className="font-medium leading-snug">{f.title}</h3>
                      <p className="mt-1 text-sm leading-relaxed text-muted">{f.body}</p>
                    </li>
                  ))}
                </ul>
              </Reveal>
            ))}
          </div>

          <Reveal className="mt-16 sm:mt-20">
            <p className="display max-w-3xl text-2xl leading-snug sm:text-[2rem]">
              <span className="text-fg">Plenty of tools will transcribe a meeting. </span>
              <span className="text-muted">
                Fewer will turn what was said into work that exists somewhere your team actually looks, and none
                of them will wait for you to say yes first.
              </span>
            </p>
          </Reveal>
        </div>
      </section>

      {/* ================= paper: what it costs ================= */}
      <section className="light py-20 sm:py-24">
        <div className="wrap">
          <div id="pricing" className="scroll-mt-14">
            <Reveal>
              <SectionHead
                eyebrow="Pricing"
                title="One price, everything included."
                action={<span className="text-sm text-muted">No seat minimum. Cancel any time.</span>}
              />
            </Reveal>

            <div className="mt-10 grid gap-4 md:grid-cols-2 md:items-start">
              {PLANS.map((plan, i) => {
                const pro = plan.highlight;
                const card = (
                  <div
                    className={`flex h-full flex-col rounded-xl border bg-panel p-6 sm:p-8 ${
                      pro ? "border-fg" : "border-panel-border"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="display text-3xl">{plan.name}</h3>
                      {pro ? <span className="pill pill-live">Most teams pick this</span> : null}
                    </div>
                    <p className="mt-1 text-sm text-muted">{plan.tagline}</p>

                    <p className="mt-7 flex items-baseline gap-1">
                      <span className={`display ${pro ? "text-6xl" : "text-5xl"}`}>{plan.price}</span>
                      {plan.cadence ? <span className="text-lg text-muted">{plan.cadence}</span> : null}
                    </p>
                    <p className="mt-1 text-sm text-faint">{plan.note}</p>

                    <p className={`mt-7 text-sm ${pro ? "font-medium text-fg" : "text-muted"}`}>{plan.lead}</p>
                    <ul className="mt-3 flex flex-1 flex-col gap-2.5">
                      {plan.features.map((f) => (
                        <li key={f} className="flex gap-2.5 text-sm leading-snug">
                          <Check strong={pro} />
                          {f}
                        </li>
                      ))}
                    </ul>

                    <Link href="/login" className={`btn mt-8 justify-center ${pro ? "btn-primary" : "btn-ghost"}`}>
                      {plan.cta}
                    </Link>
                    {pro ? <p className="mt-2.5 text-center text-xs text-faint">Start free with two meetings a month.</p> : null}
                  </div>
                );
                return (
                  <Reveal key={plan.id} delay={i * 90} className="h-full">
                    {pro ? <Tilt max={4} className="h-full">{card}</Tilt> : card}
                  </Reveal>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* ================= ink: who makes it, how to reach them, last word ================= */}
      <section id="about" className="scroll-mt-14 py-20 sm:py-24">
        <div className="wrap">
          <Reveal>
            <SectionHead eyebrow="About" title="Built around the opposite trade." />
          </Reveal>
          <div className="mt-10 grid gap-10 md:grid-cols-[1.1fr_0.9fr] md:gap-16">
            <Reveal>
              <div className="flex flex-col gap-4 text-[1.0625rem] leading-relaxed text-muted">
                <p>
                  Every team has the same meeting. Somebody agrees to do a thing, everybody nods, and three weeks
                  later nobody can remember who said it or whether it was ever written down.
                </p>
                <p>
                  The tools that fix this tend to either send a bot into your call, or file tickets automatically
                  and leave you cleaning up after a model that misheard a name.
                </p>
                <p>
                  From the Call does neither. Nothing joins your meeting, and nothing is sent, filed or emailed
                  until a person has read it and said yes. A model does the drafting, because understanding
                  language is what models are for. Everything else is ordinary code that behaves the same way
                  every time.
                </p>
                <p className="text-fg">
                  It is built and run by one person, which is why you can email and get a reply from someone who
                  can actually change the product.
                </p>
              </div>
            </Reveal>

            <Reveal delay={120}>
              <div id="contact" className="glass scroll-mt-14 p-6 sm:p-7">
                <p className="eyebrow">Contact</p>
                <p className="mt-3 font-medium">Questions, problems, or something you wish it did</p>
                <p className="mt-1 text-sm leading-relaxed text-muted">
                  Feature requests from early users are the ones that get built.
                </p>
                <a className="btn btn-ghost mt-5" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
              </div>
            </Reveal>
          </div>

          <Reveal className="mt-20 sm:mt-24">
            <div className="flex flex-col gap-6 border-t border-panel-border pt-10 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="display max-w-xl text-3xl sm:text-[2.75rem]">You have a call today. Try it on that one.</h2>
                <p className="mt-3 max-w-lg leading-relaxed text-muted">
                  Two meetings a month free, no card. If the notes are not better than the ones you would have
                  written, you have lost ten minutes.
                </p>
              </div>
              <Link href="/login" className="btn btn-primary shrink-0">Try it on your next call</Link>
            </div>
          </Reveal>
        </div>
      </section>
    </>
  );
}
