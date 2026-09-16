"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { HttpError } from "@/lib/retry";
import { postJson } from "@/lib/upload";
import { useToast } from "@/components/toast";
import { UPGRADE_MESSAGES, type UpgradeReason } from "@/lib/account";
import { PLANS } from "@/lib/site";

/**
 * Where "what does Pro include" goes from inside the app.
 *
 * Not the landing page's pricing band: a signed-in visitor to / is redirected
 * to the dashboard, so that link would bounce off the shopfront and land them
 * somewhere they did not ask to be. The Billing panel in Settings says the same
 * thing and is a page they can already reach.
 */
const PRO_LINK = "/settings#plan";

/** Quoted from the same list the shopfront reads, so the two cannot drift. */
const PRO = PLANS.find((p) => p.id === "pro");

/**
 * What to list on a wall, chosen by which wall it is.
 *
 * Not the whole plan. Settings already carries the full list in its Billing
 * panel, and a page that makes the same six promises twice reads as marketing
 * rather than as an answer. These are the lines that speak to the thing the
 * person was just stopped from doing, and the last one is the reassurance they
 * are actually weighing: nothing goes anywhere without them.
 */
const PERKS: Record<UpgradeReason, string[]> = {
  connect: [
    "Tickets drafted into Linear and Jira",
    "Follow-up emails drafted from your Gmail",
    "Summaries posted to Slack",
    "Tasks blocked out on your calendar",
  ],
  draft: [
    "Tickets drafted into Linear and Jira",
    "Follow-up emails drafted from your Gmail",
    "Every draft read and approved by you first",
  ],
  allowance: [
    "Unlimited meetings",
    "Tickets drafted into Linear and Jira",
    "Follow-up emails drafted from your Gmail",
  ],
};

/**
 * What a free account sees when it reaches one of the two walls.
 *
 * The walls are enforced on the server; this is only the explanation. Every
 * refused route answers 402 with `{ error, upgrade: <reason> }`, so a blocked
 * action can say which wall it hit rather than showing a generic "upgrade",
 * which tells nobody anything.
 */

/** True when a failed request was refused for money rather than for permission. */
export function isUpgradeError(err: unknown): err is HttpError {
  return err instanceof HttpError && err.status === 402;
}

/** The line to show for a wall, falling back to whatever the server said. */
export function upgradeMessage(reason: UpgradeReason | null, fallback: string): string {
  return reason ? UPGRADE_MESSAGES[reason] : fallback;
}

/** What a button says while its checkout or portal session is being made. */
const NOT_SET_UP = "Payments aren't set up on this server yet.";

/**
 * Asks the server for a Stripe URL and leaves for it.
 *
 * The leaving is done in an effect keyed on the URL rather than in the click
 * handler: Stripe is another origin, so this is a document navigation and not
 * a route push, and writing to `window.location` mid-handler is exactly what
 * the lint rules here forbid. `url` also doubles as the latch that makes a
 * second click a no-op, so one impatient person cannot open two subscriptions.
 */
function useStripeRedirect(endpoint: string, failureMessage: string) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    if (url) window.location.href = url;
  }, [url]);

  async function go() {
    if (busy || url) return;
    setBusy(true);
    try {
      const res = await postJson<{ url: string }>(endpoint, {});
      // Left busy on purpose. The browser is on its way out; re-enabling the
      // button during that gap only invites a second click.
      setUrl(res.url);
    } catch (err) {
      // 503 is a server that has no Stripe keys, which is a fact about this
      // deployment rather than something the person did wrong.
      if (err instanceof HttpError && err.status === 503) setUnavailable(true);
      else toast(err instanceof Error ? err.message : failureMessage, "error");
      setBusy(false);
    }
  }

  return { go, busy: busy || !!url, unavailable };
}

/** Starts a payment: POST to checkout, then follow Stripe's URL. */
export function UpgradeButton({
  label = "Upgrade to Pro",
  className = "btn btn-primary",
}: {
  label?: string;
  className?: string;
}) {
  const { go, busy, unavailable } = useStripeRedirect("/api/billing/checkout", "Could not start the upgrade");

  if (unavailable) return <span className="text-xs text-muted">{NOT_SET_UP}</span>;

  return (
    <button type="button" className={className} disabled={busy} onClick={go}>
      {busy ? "Opening checkout…" : label}
    </button>
  );
}

/** Stripe's own portal: change the card, read the invoices, cancel. */
export function ManageBillingButton({ className = "btn btn-ghost" }: { className?: string }) {
  const { go, busy, unavailable } = useStripeRedirect("/api/billing/portal", "Could not open billing");

  if (unavailable) return <span className="text-xs text-muted">{NOT_SET_UP}</span>;

  return (
    <button type="button" className={className} disabled={busy} onClick={go}>
      {busy ? "Opening…" : "Manage billing"}
    </button>
  );
}

/**
 * A quiet inline nudge, for where an action would have been. Deliberately not
 * a modal: someone who just wanted to draft a ticket should be able to read
 * what happened and carry on, not be interrupted.
 */
export function UpgradeNote({ reason, className = "" }: { reason: UpgradeReason; className?: string }) {
  return (
    <span className={`inline-flex flex-wrap items-baseline gap-x-2 gap-y-1 text-xs ${className}`}>
      <span className="text-muted">{UPGRADE_MESSAGES[reason]}</span>
      <UpgradeButton label="Upgrade" className="font-medium text-accent transition-opacity hover:opacity-70 disabled:opacity-50" />
      <Link href={PRO_LINK} className="text-faint underline underline-offset-2 transition-colors hover:text-fg">
        What Pro includes
      </Link>
    </span>
  );
}

/**
 * The same wall with room around it, for a whole panel rather than one row.
 *
 * It says what Pro *is* rather than only what this account is not. A refusal
 * with a bare "Upgrade to Pro" under it asks somebody to pay for a list they
 * would have to leave the page to read, so the list is here: the price, what
 * the money buys, and the two facts people actually hesitate over — that it
 * cancels in one click and that nothing is ever sent without them approving it.
 */
export function UpgradePanel({
  reason,
  title,
  children,
}: {
  reason: UpgradeReason;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-panel-border bg-panel-hi p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="font-display text-base font-semibold">{title}</p>
        {PRO ? (
          <p className="text-sm text-muted">
            {/* Mono, because it is a figure. Fraunces is for words. */}
            <span className="figure text-fg">{PRO.price}</span>
            {PRO.cadence}
            {PRO.note ? ` ${PRO.note}` : ""}
          </p>
        ) : null}
      </div>
      <p className="mt-1.5 text-sm leading-relaxed text-muted">{UPGRADE_MESSAGES[reason]}</p>
      {children ? <div className="mt-2 text-sm leading-relaxed text-muted">{children}</div> : null}

      {PRO ? (
        <ul className="mt-4 grid gap-x-6 gap-y-1.5 text-sm text-muted sm:grid-cols-2">
          {PERKS[reason].map((feature) => (
            <li key={feature} className="flex items-baseline gap-2">
              <span aria-hidden className="text-agreed">·</span>
              <span>{feature}</span>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <UpgradeButton />
        <Link href={PRO_LINK} className="text-xs text-muted underline underline-offset-2 transition-colors hover:text-fg">
          See what Pro includes
        </Link>
      </div>
      <p className="mt-3 text-xs leading-relaxed text-faint">
        Cancel any time in the payment provider&apos;s own portal. Your meetings, notes and tasks stay yours either way.
      </p>
    </div>
  );
}
