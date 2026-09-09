"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function LoginForm() {
  const params = useSearchParams();
  const next = params.get("next") ?? "/meetings";
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(params.get("error"));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const value = email.trim().toLowerCase();
    if (!EMAIL_RE.test(value)) {
      setError("That doesn't look like an email address.");
      return;
    }
    setState("sending");
    const redirect = new URL("/auth/callback", window.location.origin);
    redirect.searchParams.set("next", next);
    const { error } = await supabaseBrowser().auth.signInWithOtp({
      email: value,
      options: { emailRedirectTo: redirect.toString() },
    });
    if (error) {
      setState("idle");
      setError(
        /rate limit/i.test(error.message)
          ? "Too many sign-in emails were sent recently. Wait a few minutes and try again."
          : error.message,
      );
      return;
    }
    setState("sent");
  }

  if (state === "sent") {
    return (
      <div className="mt-6">
        <p className="font-medium">Check your inbox</p>
        <p className="mt-1 text-sm text-muted">
          We sent a link to <span className="text-fg">{email}</span>. Open it on this device to finish signing in. It can take a minute to arrive.
        </p>
        <button className="btn btn-ghost mt-4 !px-3 !py-1.5 text-xs" onClick={() => setState("idle")}>Use a different email</button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="mt-6 flex flex-col gap-3">
      <input
        type="email"
        autoComplete="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@company.com"
        className="rounded-xl border border-panel-border bg-black/30 px-4 py-3 text-fg outline-none focus:border-accent"
      />
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      <button className="btn btn-primary justify-center" disabled={state === "sending"}>
        {state === "sending" ? "Sending…" : "Send sign-in link"}
      </button>
    </form>
  );
}
