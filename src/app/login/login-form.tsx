"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { friendlyAuthError, isValidEmail, passwordProblem, PASSWORD_MIN_LENGTH } from "@/lib/auth-errors";

type Mode = "signin" | "signup" | "forgot" | "magic";
type Sent = null | "confirm" | "reset" | "magic";

const TITLES: Record<Mode, string> = {
  signin: "Sign in",
  signup: "Create your account",
  forgot: "Reset your password",
  magic: "Sign in with an email link",
};

export default function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));

  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<Sent>(null);
  const [error, setError] = useState<string | null>(params.get("error"));
  const [notice, setNotice] = useState<string | null>(params.get("notice"));

  function switchMode(m: Mode) {
    setMode(m);
    setError(null);
    setNotice(null);
    setSent(null);
  }

  function callbackUrl(target = next) {
    const u = new URL("/auth/callback", window.location.origin);
    u.searchParams.set("next", target);
    return u.toString();
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    const value = email.trim().toLowerCase();
    if (!isValidEmail(value)) {
      setError("That doesn't look like an email address.");
      return;
    }
    if (mode === "signin" || mode === "signup") {
      const problem = mode === "signup" ? passwordProblem(password, value) : password.length === 0 ? "Enter your password." : null;
      if (problem) {
        setError(problem);
        return;
      }
    }

    setBusy(true);
    const supabase = supabaseBrowser();
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email: value, password });
        if (error) throw error;
        router.push(next);
        router.refresh();
        return;
      }

      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({ email: value, password, options: { emailRedirectTo: callbackUrl() } });
        if (error) throw error;
        if (data.session) {
          router.push(next);
          router.refresh();
          return;
        }
        setSent("confirm");
        return;
      }

      if (mode === "forgot") {
        const { error } = await supabase.auth.resetPasswordForEmail(value, { redirectTo: callbackUrl("/reset-password") });
        if (error) throw error;
        setSent("reset");
        return;
      }

      const { error } = await supabase.auth.signInWithOtp({ email: value, options: { emailRedirectTo: callbackUrl() } });
      if (error) throw error;
      setSent("magic");
    } catch (err) {
      setError(friendlyAuthError(err instanceof Error ? err.message : String(err)));
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    const body =
      sent === "confirm"
        ? "Click the link in that email to confirm your address, and you'll be signed in."
        : sent === "reset"
          ? "Click the link in that email to choose a new password."
          : "Click the link in that email and you'll be signed in on this device.";
    return (
      <div className="mt-6">
        <p className="font-medium">Check your inbox</p>
        <p className="mt-1 text-sm text-muted">
          We sent a message to <span className="text-fg">{email.trim().toLowerCase()}</span>. {body} It can take a minute to arrive.
        </p>
        <button className="btn btn-ghost mt-4 !px-3 !py-1.5 text-xs" onClick={() => switchMode("signin")}>Back to sign in</button>
      </div>
    );
  }

  const needsPassword = mode === "signin" || mode === "signup";
  const action = mode === "signin" ? "Sign in" : mode === "signup" ? "Create account" : mode === "forgot" ? "Send reset link" : "Send sign-in link";

  return (
    <>
      <h1 className="mt-3 text-2xl font-semibold">{TITLES[mode]}</h1>
      <p className="mt-2 text-sm text-muted">
        {mode === "signin" && "Use the email and password you signed up with."}
        {mode === "signup" && "Your meetings and notes are private to your account."}
        {mode === "forgot" && "We'll email you a link to set a new password."}
        {mode === "magic" && "No password needed. We email you a link that signs you in."}
      </p>

      <form onSubmit={submit} className="mt-6 flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-xs text-muted">
          Email
          <input
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
            className="rounded-xl border border-panel-border bg-black/30 px-4 py-3 text-base text-fg outline-none focus:border-accent"
          />
        </label>

        {needsPassword ? (
          <label className="flex flex-col gap-1 text-xs text-muted">
            Password
            <span className="relative flex items-center">
              <input
                type={showPassword ? "text" : "password"}
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={mode === "signup" ? `At least ${PASSWORD_MIN_LENGTH} characters` : "Your password"}
                className="w-full rounded-xl border border-panel-border bg-black/30 px-4 py-3 pr-16 text-base text-fg outline-none focus:border-accent"
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                className="absolute right-3 text-xs text-muted hover:text-fg"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </span>
          </label>
        ) : null}

        {notice ? <p className="text-sm text-accent">{notice}</p> : null}
        {error ? <p className="text-sm text-danger">{error}</p> : null}

        <button className="btn btn-primary justify-center" disabled={busy}>{busy ? "Working…" : action}</button>
      </form>

      <div className="mt-5 flex flex-col gap-2 border-t border-panel-border pt-4 text-xs text-muted">
        {mode === "signin" ? (
          <>
            <span>
              New here? <button className="text-accent hover:underline" onClick={() => switchMode("signup")}>Create an account</button>
            </span>
            <span>
              <button className="text-accent hover:underline" onClick={() => switchMode("forgot")}>Forgot your password?</button>
              {" · "}
              <button className="text-accent hover:underline" onClick={() => switchMode("magic")}>Email me a link instead</button>
            </span>
          </>
        ) : (
          <span>
            <button className="text-accent hover:underline" onClick={() => switchMode("signin")}>Back to sign in</button>
            {mode !== "signup" ? (
              <>
                {" · "}
                <button className="text-accent hover:underline" onClick={() => switchMode("signup")}>Create an account</button>
              </>
            ) : null}
          </span>
        )}
      </div>
    </>
  );
}

function safeNext(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/meetings";
  return value;
}
