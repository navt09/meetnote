import { NextResponse } from "next/server";
import { getAuth } from "@/lib/supabase/server";
import { deleteAccount } from "@/lib/account-delete";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Delete the caller's own account and everything in it.
 *
 * Only ever the caller's own: the id comes from the verified session, never
 * from the request body, so there is no id for anyone to tamper with.
 *
 * The typed confirmation is required server-side as well as in the UI. A
 * confirmation that only exists in the browser is decoration, and this is the
 * one action in the product that cannot be undone.
 */
export async function DELETE(req: Request) {
  const auth = await getAuth(req);
  if (!auth) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  let body: { confirm?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const email = auth.user.email ?? "";
  if (typeof body.confirm !== "string" || body.confirm.trim().toLowerCase() !== email.toLowerCase()) {
    return NextResponse.json({ error: "Type your email address exactly to confirm." }, { status: 400 });
  }

  try {
    const result = await deleteAccount(auth.user.id);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    // Nothing partial is reported as success: the user is told it failed so
    // they can retry, rather than believing their data is gone when it is not.
    console.error(JSON.stringify({ event: "account_delete_error", message: err instanceof Error ? err.message : String(err) }));
    return NextResponse.json({ error: "Could not delete your account. Nothing was removed. Try again in a minute." }, { status: 500 });
  }
}
