import { NextResponse } from "next/server";
import { getAuth } from "@/lib/supabase/server";
import { cleanDisplayName, setDisplayName } from "@/lib/settings-store";

export const runtime = "nodejs";

/**
 * The name the notes use for this person. An empty name clears it, and the
 * notes go back to saying "You".
 */
export async function PUT(req: Request) {
  const auth = await getAuth(req);
  if (!auth) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  let body: { name?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const name = cleanDisplayName(body.name);
  try {
    await setDisplayName(auth.user.id, name);
    return NextResponse.json({ ok: true, name });
  } catch (err) {
    console.error(JSON.stringify({ event: "display_name_save_error", message: err instanceof Error ? err.message : String(err) }));
    return NextResponse.json({ error: "Could not save your name." }, { status: 500 });
  }
}
