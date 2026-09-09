import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { supabaseServer } from "@/lib/supabase/server";
import { friendlyAuthError } from "@/lib/auth-errors";

/** Where email links land: turns the one-time code into a session cookie. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;

  // Supabase can report a problem straight on the redirect.
  const linkError = url.searchParams.get("error_description") ?? url.searchParams.get("error");

  let next = safePath(url.searchParams.get("next"));
  // A recovery link always goes to the page that sets a new password.
  if (type === "recovery") next = "/reset-password";

  if (linkError) return redirectToLogin(url, linkError, next);

  const supabase = await supabaseServer();
  let message: string | null = null;

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    message = error?.message ?? null;
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    message = error?.message ?? null;
  } else {
    message = "The link is missing its code.";
  }

  if (message) return redirectToLogin(url, message, next);
  return NextResponse.redirect(new URL(next, url.origin));
}

function redirectToLogin(url: URL, message: string, next: string) {
  const login = new URL("/login", url.origin);
  login.searchParams.set("error", friendlyAuthError(message));
  if (next !== "/notes") login.searchParams.set("next", next);
  return NextResponse.redirect(login);
}

/** Only same-site relative paths; never "//evil.com". */
function safePath(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/notes";
  return value;
}
