import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
import { meetingsUsedThisMonth, tierFor } from "@/lib/account-store";
import { FREE_MEETINGS_PER_MONTH, hasMeetingsLeft, meetingsLeft, monthStart } from "@/lib/account";
import { getDisplayName } from "@/lib/settings-store";
import { PageHead } from "@/components/ui";
import { UpgradePanel } from "@/components/upgrade";
import { NameGate } from "@/components/name-gate";
import RecordView from "./record-view";

export const dynamic = "force-dynamic";
export const metadata = { title: "Record · From the Call" };

/**
 * When the free allowance refills: the first moment of the month after the one
 * `now` sits in. Derived from `monthStart` so it can never disagree with the
 * boundary the server counts against, and formatted in UTC for the same reason.
 */
function allowanceResetsOn(now: Date): string {
  const start = monthStart(now);
  const next = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
  return next.toLocaleDateString(undefined, { day: "numeric", month: "long", timeZone: "UTC" });
}

/** The name prompt, shown instead of the recorder until there is a name. */
function askForName() {
  return (
    <section className="flex flex-col gap-6 pt-10">
      <PageHead title="Record" />
      <NameGate />
    </section>
  );
}

export default async function RecordPage() {
  const db = await supabaseServer();
  const { data } = await db.auth.getUser();
  const user = data.user;

  // Two independent reads; there is no reason to wait for one before the other.
  const [tier, name] = user
    ? await Promise.all([tierFor(user.id, user.email), getDisplayName(user.id)])
    : (["free", null] as const);

  // Asked for before anything is captured, not at save time. The name decides
  // whose lines are whose in the transcript, what the "for you" notes are for,
  // and which tasks the Tasks page calls yours; a recording made without it is
  // quietly worse in ways nobody would think to complain about. Asked once:
  // whoever has a name never sees this again.
  const needsName = Boolean(user) && !name;

  // Paid accounts have no cap, so they are never counted and never told a number.
  if (tier !== "free") return needsName ? askForName() : <RecordView />;

  const now = new Date();
  const used = user ? await meetingsUsedThisMonth(user.id, now) : 0;

  // Say so before they record forty minutes and hit a wall on save. This comes
  // ahead of the name prompt deliberately: asking someone to introduce
  // themselves and then refusing them is the wrong order to deliver bad news.
  if (!hasMeetingsLeft(tier, used)) {
    return (
      <section className="flex flex-col gap-6 pt-10">
        <PageHead title="Record" />
        <UpgradePanel reason="allowance" title="No meetings left this month">
          Your {FREE_MEETINGS_PER_MONTH} free meetings come back on {allowanceResetsOn(now)}. Until then you can still read{" "}
          <Link href="/notes" className="text-accent underline underline-offset-2">
            the notes you already have
          </Link>
          .
        </UpgradePanel>
      </section>
    );
  }

  if (needsName) return askForName();

  return <RecordView meetingsLeft={meetingsLeft(tier, used)} />;
}
