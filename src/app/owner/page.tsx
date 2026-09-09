import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { tierFor } from "@/lib/account-store";
import { listAccounts, type OwnerAccount } from "@/lib/owner-store";
import OwnerView from "./owner-view";

export const dynamic = "force-dynamic";
export const metadata = { title: "Owner · Meetnote" };

/**
 * The operator's page: who has signed up, what they cost, and the only way to
 * grant a paid account until billing exists.
 *
 * A non-owner is sent to the dashboard rather than shown a refusal, so the
 * route gives nothing away.
 */
export default async function OwnerPage() {
  const db = await supabaseServer();
  const { data } = await db.auth.getUser();
  const user = data.user;
  if (!user) redirect("/login");

  const tier = await tierFor(user.id, user.email);
  if (tier !== "owner") redirect("/dashboard");

  let accounts: OwnerAccount[] = [];
  let loadError: string | null = null;
  try {
    accounts = await listAccounts();
  } catch (err) {
    console.error(JSON.stringify({ event: "owner_page_error", message: err instanceof Error ? err.message : "unknown" }));
    loadError = "Could not load accounts. Refresh to try again.";
  }

  return <OwnerView selfId={user.id} initial={accounts} loadError={loadError} />;
}
