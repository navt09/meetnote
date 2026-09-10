import { NextResponse } from "next/server";
import { getAuth } from "@/lib/supabase/server";
import { cleanTheme, setTheme } from "@/lib/settings-store";

export const runtime = "nodejs";

/** Which surface this account sees the app on. Anything else is rejected. */
export async function PUT(req: Request) {
  const auth = await getAuth(req);
  if (!auth) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  let body: { theme?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const theme = cleanTheme(body.theme);
  if (!theme) return NextResponse.json({ error: "Choose light or dark." }, { status: 400 });

  try {
    await setTheme(auth.user.id, theme);
    return NextResponse.json({ ok: true, theme });
  } catch (err) {
    console.error(JSON.stringify({ event: "theme_save_error", message: err instanceof Error ? err.message : String(err) }));
    return NextResponse.json({ error: "Could not save your choice." }, { status: 500 });
  }
}
