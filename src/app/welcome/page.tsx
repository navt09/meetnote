import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { tierFor } from "@/lib/account-store";
import { FREE_MEETINGS_PER_MONTH } from "@/lib/account";
import { PLANS } from "@/lib/site";
import { PageHead } from "@/components/ui";
import { UpgradeButton } from "@/components/upgrade";

export const dynamic = "force-dynamic";
export const metadata = { title: "Welcome · From the Call" };

/**
 * The one moment Pro is offered unprompted: straight after an account is made.
 *
 * It is a page rather than a modal, and it has a plain way past it, because the
 * free tier is a real tier and not a countdown. Somebody who wants to try the
 * product on their own meetings first is the person most likely to pay later,
 * and a dialog they have to dismiss is the worst possible first thing to show
 * them.
 *
 * Nobody is sent here twice: the signup flow points at it once, and an account
 * that already pays is moved on rather than sold something it has.
 */
export default async function WelcomePage() {
  const db = await supabaseServer();
  const { data } = await db.auth.getUser();
  const user = data.user;
  if (!user) redirect("/login");

  // Already paying, or the owner. There is nothing here for them.
  const tier = await tierFor(user.id, user.email);
  if (tier !== "free") redirect("/dashboard");

  const free = PLANS.find((p) => p.id === "free");
  const pro = PLANS.find((p) => p.id === "pro");

  return (
    <section className="flex flex-col gap-6 pt-10">
      <PageHead title="Your account is ready" meta="Pick how you want to start. You can change this whenever you like." />

      <div className="grid gap-4 md:grid-cols-2">
        {/* Pro first, because it is the recommendation. */}
        <div className="rounded-xl border border-panel-border bg-panel-hi p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <p className="font-display text-lg font-semibold">{pro?.name}</p>
            <p className="text-sm text-muted">
              <span className="figure text-fg">{pro?.price}</span>
              {pro?.cadence} {pro?.note}
            </p>
          </div>
          <p className="mt-1.5 text-sm leading-relaxed text-muted">{pro?.tagline}</p>

          <ul className="mt-4 flex flex-col gap-1.5 text-sm text-muted">
            {pro?.features.map((feature) => (
              <li key={feature} className="flex items-baseline gap-2">
                <span aria-hidden className="text-agreed">·</span>
                <span>{feature}</span>
              </li>
            ))}
          </ul>

          <UpgradeButton className="btn btn-primary mt-5" label="Start with Pro" />
          <p className="mt-3 text-xs leading-relaxed text-faint">
            Cancel any time in the payment provider&apos;s own portal. Nothing is ever sent from your account without
            you reading it and approving it first.
          </p>
        </div>

        <div className="rounded-xl border border-panel-border p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <p className="font-display text-lg font-semibold">{free?.name}</p>
            <p className="text-sm text-muted">
              <span className="figure text-fg">{free?.price}</span> {free?.note}
            </p>
          </div>
          <p className="mt-1.5 text-sm leading-relaxed text-muted">{free?.tagline}</p>

          <ul className="mt-4 flex flex-col gap-1.5 text-sm text-muted">
            {free?.features.map((feature) => (
              <li key={feature} className="flex items-baseline gap-2">
                <span aria-hidden className="text-faint">·</span>
                <span>{feature}</span>
              </li>
            ))}
          </ul>

          {/* Deliberately quieter than the Pro button: two buttons of equal
              weight make this a decision, and it is not one. It is a way past. */}
          <Link
            href="/record"
            className="mt-5 inline-block text-sm text-muted underline underline-offset-4 transition-colors hover:text-fg"
          >
            Continue on Free
          </Link>
          <p className="mt-3 text-xs leading-relaxed text-faint">
            {FREE_MEETINGS_PER_MONTH} meetings a month, with the transcript, the notes and the action items. What Free
            does not do is draft anything or reach your other apps.
          </p>
        </div>
      </div>
    </section>
  );
}
