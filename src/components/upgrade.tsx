"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { HttpError } from "@/lib/retry";
import { postJson } from "@/lib/upload";
import { useToast } from "@/components/toast";
import { UPGRADE_MESSAGES, type UpgradeReason } from "@/lib/account";

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
      <Link href="/#pricing" className="text-faint underline underline-offset-2 transition-colors hover:text-fg">
        What Pro includes
      </Link>
    </span>
  );
}

/** The same thing with room around it, for a whole panel rather than one row. */
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
      <p className="font-display text-base font-semibold">{title}</p>
      <p className="mt-1.5 text-sm leading-relaxed text-muted">{UPGRADE_MESSAGES[reason]}</p>
      {children ? <div className="mt-2 text-sm leading-relaxed text-muted">{children}</div> : null}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <UpgradeButton />
        <Link href="/#pricing" className="text-xs text-muted underline underline-offset-2 transition-colors hover:text-fg">
          See what Pro includes
        </Link>
      </div>
    </div>
  );
}
