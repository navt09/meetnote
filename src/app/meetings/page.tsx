import { redirect } from "next/navigation";

/** The meetings list moved to /notes; keep old links working. */
export default function MeetingsPage() {
  redirect("/notes");
}
