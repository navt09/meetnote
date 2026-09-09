import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { supabaseServer } from "@/lib/supabase/server";

/** Where the magic link lands. Turns the one-time code into a session cookie. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const rawNext = url.searchParams.get("next") ?? "/meetings";
  // Only allow same-site relative paths, never "//evil.com".
  const next = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/meetings";

  const supabase = await supabaseServer();
  let errorMessage: string | null = null;

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    errorMessage = error?.message ?? null;
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    errorMessage = error?.message ?? null;
  } else {
    errorMessage = "The sign-in link is missing its code.";
  }

  if (errorMessage) {
    const login = new URL("/login", url.origin);
    login.searchParams.set("error", errorMessage);
    return NextResponse.redirect(login);
  }
  return NextResponse.redirect(new URL(next, url.origin));
}
