import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
import { meetingsUsedThisMonth, tierFor } from "@/lib/account-store";
import { FREE_MEETINGS_PER_MONTH, hasMeetingsLeft, meetingsLeft, monthStart } from "@/lib/account";
import { PageHead } from "@/components/ui";
import { UpgradePanel } from "@/components/upgrade";
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

export default async function RecordPage() {
  const db = await supabaseServer();
  const { data } = await db.auth.getUser();
  const tier = data.user ? await tierFor(data.user.id, data.user.email) : "free";

  // Paid accounts have no cap, so they are never counted and never told a number.
  if (tier !== "free") return <RecordView />;

  const now = new Date();
  const used = data.user ? await meetingsUsedThisMonth(data.user.id, now) : 0;

  // Say so before they record forty minutes and hit a wall on save.
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

  return <RecordView meetingsLeft={meetingsLeft(tier, used)} />;
}
