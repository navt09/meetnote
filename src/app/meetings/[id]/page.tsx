import { supabaseServer } from "@/lib/supabase/server";
import { tierFor } from "@/lib/account-store";
import { ticketDestinationFor } from "@/lib/connector-store";
import { NO_TICKET_DESTINATION } from "@/lib/ticket-destination";
import MeetingView from "./meeting-view";

export const dynamic = "force-dynamic";

/**
 * The meeting itself is loaded in the browser, because it is polled while the
 * pipeline runs. Only the tier is read here: it decides which of the follow-up
 * actions the notes may offer at all, and reading it on the server means the
 * first paint is already right rather than flickering a button away.
 */
export default async function MeetingPage() {
  const db = await supabaseServer();
  const { data } = await db.auth.getUser();
  const [tier, ticketDestination] = data.user
    ? await Promise.all([tierFor(data.user.id, data.user.email), ticketDestinationFor(data.user.id)])
    : (["free", NO_TICKET_DESTINATION] as const);

  return <MeetingView tier={tier} ticketDestination={ticketDestination} />;
}
