"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { friendlyAuthError, passwordProblem, PASSWORD_MIN_LENGTH } from "@/lib/auth-errors";

export default function ResetForm() {
  const router = useRouter();
  const [ready, setReady] = useState<boolean | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // The recovery link signs the user in; without that session there's nothing to reset.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabaseBrowser().auth.getUser();
        if (cancelled) return;
        setReady(!!data.user);
        setEmail(data.user?.email ?? null);
      } catch {
        if (!cancelled) setReady(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const problem = passwordProblem(password, email ?? "");
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { error } = await supabaseBrowser().auth.updateUser({ password });
      if (error) throw error;
      setDone(true);
      setTimeout(() => {
        router.push("/dashboard");
        router.refresh();
      }, 1200);
    } catch (err) {
      setError(friendlyAuthError(err instanceof Error ? err.message : String(err)));
    } finally {
      setBusy(false);
    }
  }

  if (ready === null) return <p className="mt-6 text-sm text-muted">Checking your link…</p>;

  if (!ready) {
    return (
      <div className="mt-6">
        <p className="text-sm text-danger">This reset link is invalid or has expired.</p>
        <Link href="/login" className="btn btn-ghost mt-4 !px-3 !py-1.5 text-xs">Request a new one</Link>
      </div>
    );
  }

  if (done) {
    return (
      <div className="mt-6">
        <p className="font-medium text-ok">Password updated</p>
        <p className="mt-1 text-sm text-muted">Taking you to your meetings…</p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="mt-6 flex flex-col gap-3">
      {email ? <p className="text-sm text-muted">Signed in as <span className="text-fg">{email}</span></p> : null}
      <label className="flex flex-col gap-1 text-xs text-muted">
        New password
        <span className="relative flex items-center">
          <input
            type={show ? "text" : "password"}
            autoComplete="new-password"
            required
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={`At least ${PASSWORD_MIN_LENGTH} characters`}
            className="w-full field pr-16 text-base"
          />
          <button type="button" onClick={() => setShow((s) => !s)} className="absolute right-3 text-xs text-muted hover:text-fg">
            {show ? "Hide" : "Show"}
          </button>
        </span>
      </label>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      <button className="btn btn-primary justify-center" disabled={busy}>{busy ? "Saving…" : "Save new password"}</button>
    </form>
  );
}
