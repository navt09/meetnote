"use client";

import { useState } from "react";
import { getJson, patchJson } from "@/lib/upload";
import { useToast } from "@/components/toast";
import { TIER_LABEL, type Tier } from "@/lib/account";
import type { OwnerAccount } from "@/lib/owner-store";

const money = (n: number) => `$${n.toFixed(n > 0 && n < 1 ? 4 : 2)}`;

/** Short, humane ages. Exact dates matter less here than "is anyone still using it". */
function when(iso: string | null): string {
  if (!iso) return "never";
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export default function OwnerView({
  selfId,
  initial,
  loadError,
}: {
  selfId: string;
  initial: OwnerAccount[];
  loadError: string | null;
}) {
  const toast = useToast();
  const [accounts, setAccounts] = useState<OwnerAccount[]>(initial);
  const [error, setError] = useState<string | null>(loadError);
  const [busy, setBusy] = useState<string | null>(null);

  async function refresh() {
    try {
      const data = await getJson<{ accounts: OwnerAccount[] }>("/api/owner/accounts");
      setAccounts(data.accounts);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load accounts.");
    }
  }

  async function move(account: OwnerAccount, tier: Tier) {
    setBusy(account.userId);
    // Optimistic: the row flips at once and rolls back if the server refuses.
    const before = accounts;
    setAccounts((prev) => prev.map((a) => (a.userId === account.userId ? { ...a, tier } : a)));
    try {
      await patchJson("/api/owner/accounts", { userId: account.userId, tier });
      toast(`${account.email ?? "That account"} is now ${TIER_LABEL[tier].toLowerCase()}.`, "ok");
    } catch (err) {
      setAccounts(before);
      toast(err instanceof Error ? err.message : "Could not save that change.", "error");
    } finally {
      setBusy(null);
    }
  }

  const paying = accounts.filter((a) => a.tier === "active").length;
  const meetings = accounts.reduce((n, a) => n + a.meetings, 0);
  const spend = accounts.reduce((n, a) => n + a.costUsd, 0);

  return (
    <section className="flex flex-col gap-6 pt-10">
      <div className="rise">
        <h1 className="text-3xl font-semibold tracking-tight">Owner</h1>
        <p className="mt-1 text-sm text-muted">Everyone who has signed up, and what running them costs.</p>
      </div>

      <div className="rise grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Accounts" value={String(accounts.length)} />
        <Stat label="Active" value={String(paying)} />
        <Stat label="Meetings" value={String(meetings)} />
        <Stat label="Vendor spend" value={money(spend)} hint="Transcription plus the model, all time." />
      </div>

      {error ? <p className="glass border-danger/40 p-4 text-sm text-danger">{error}</p> : null}

      <div className="glass overflow-hidden">
        <div className="flex items-center justify-between border-b border-panel-border px-5 py-3">
          <p className="text-sm font-medium">Accounts</p>
          <button className="btn btn-ghost !py-1.5 text-xs" onClick={refresh}>Refresh</button>
        </div>

        {accounts.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-muted">Nobody has signed up yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-panel-border text-left text-xs text-faint">
                  <th className="px-5 py-2 font-medium">Email</th>
                  <th className="px-3 py-2 font-medium">Joined</th>
                  <th className="px-3 py-2 font-medium">Last seen</th>
                  <th className="px-3 py-2 text-right font-medium">Meetings</th>
                  <th className="px-3 py-2 text-right font-medium">Cost</th>
                  <th className="px-5 py-2 font-medium">Tier</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((a) => (
                  <tr key={a.userId} className="border-b border-panel-border/60 last:border-0">
                    <td className="max-w-[24ch] truncate px-5 py-3" title={a.email ?? ""}>
                      {a.email ?? <span className="text-faint">no email</span>}
                      {a.userId === selfId ? <span className="pill pill-live ml-2">you</span> : null}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-muted">{when(a.createdAt)}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-muted">{when(a.lastSignInAt)}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-muted">{a.meetings || "—"}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-muted">{a.costUsd > 0 ? money(a.costUsd) : "—"}</td>
                    <td className="px-5 py-3">
                      {a.tier === "owner" ? (
                        <span className="pill pill-live">Owner</span>
                      ) : (
                        <div className="inline-flex gap-0.5 rounded-lg border border-panel-border p-0.5">
                          {(["free", "active"] as const).map((t) => (
                            <button
                              key={t}
                              disabled={busy === a.userId || a.tier === t}
                              onClick={() => move(a, t)}
                              className={`rounded-md px-2.5 py-1 text-xs transition-colors disabled:opacity-100 ${
                                a.tier === t ? "bg-panel-hi font-medium text-fg" : "text-muted hover:text-fg"
                              }`}
                            >
                              {TIER_LABEL[t]}
                            </button>
                          ))}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="text-xs text-faint">
        Owner comes from the OWNER_EMAILS setting on the server, not from this page, so no click here can create another owner.
      </p>
    </section>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="glass p-4">
      <p className="text-xs text-faint">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight">{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
    </div>
  );
}
