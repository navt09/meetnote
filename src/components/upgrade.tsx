"use client";

import Link from "next/link";
import { HttpError } from "@/lib/retry";
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

/**
 * A quiet inline nudge, for where an action would have been. Deliberately not
 * a modal: someone who just wanted to draft a ticket should be able to read
 * what happened and carry on, not be interrupted.
 */
export function UpgradeNote({ reason, className = "" }: { reason: UpgradeReason; className?: string }) {
  return (
    <span className={`inline-flex flex-wrap items-baseline gap-x-2 gap-y-1 text-xs ${className}`}>
      <span className="text-muted">{UPGRADE_MESSAGES[reason]}</span>
      <Link href="/#pricing" className="font-medium text-accent transition-opacity hover:opacity-70">
        See Pro
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
      <Link href="/#pricing" className="btn btn-primary mt-4">
        See what Pro includes
      </Link>
    </div>
  );
}
