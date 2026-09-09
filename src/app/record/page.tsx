import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
import { tierFor } from "@/lib/account-store";
import { canRecord } from "@/lib/account";
import { EmptyState } from "@/components/ui";
import RecordView from "./record-view";

export const dynamic = "force-dynamic";
export const metadata = { title: "Record · Meetnote" };

export default async function RecordPage() {
  const db = await supabaseServer();
  const { data } = await db.auth.getUser();
  const tier = data.user ? await tierFor(data.user.id, data.user.email) : "free";

  // Say so before they record forty minutes and hit a wall on save.
  if (!canRecord(tier)) {
    return (
      <section className="flex flex-col gap-6 pt-10">
        <h1 className="rise text-3xl font-semibold tracking-tight">Record</h1>
        <EmptyState
          title="Recording needs an active account"
          body="Your free account can read the meetings and notes you already have. Recording, transcription and AI notes need an active account."
          action={<Link href="/notes" className="btn btn-ghost">Back to notes</Link>}
        />
      </section>
    );
  }

  return <RecordView />;
}
