"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { deleteJson, deleteJsonWithBody, getJson, patchJson, postJson, putJson } from "@/lib/upload";
import { useToast } from "@/components/toast";
import { PROVIDER_PURPOSE, type PublicConnector, type Provider, type TicketProvider } from "@/lib/connectors";
import { BrandMark } from "@/components/brand-marks";
import { canConnect, TIER_BLURB, TIER_LABEL, type Tier } from "@/lib/account";
import { enableableProducts, PRODUCTS } from "@/lib/microsoft-scopes";
import { ManageBillingButton, UpgradeButton, UpgradePanel } from "@/components/upgrade";
import { PLANS } from "@/lib/site";
import { settingsFlash } from "@/lib/flash";
import type { Theme } from "@/lib/settings-store";
import { PageHead } from "@/components/ui";

type Team = { id: string; name: string };
type Project = { id: string; key: string; name: string };

/** How Stripe's checkout page sent the browser back here, if it did. */
export type CheckoutOutcome = "done" | "cancelled" | null;

export default function SettingsView({
  initial,
  initialTicketProvider,
  storageReady,
  googleReady,
  microsoftReady,
  oauthReady,
  tier,
  paymentsReady,
  subscriptionStatus,
  hasStripeCustomer,
  checkout,
  email,
  displayName,
  theme,
}: {
  initial: PublicConnector[];
  theme: Theme;
  initialTicketProvider: TicketProvider | null;
  storageReady: boolean;
  googleReady: boolean;
  microsoftReady: boolean;
  oauthReady: { linear: boolean; jira: boolean; slack: boolean };
  tier: Tier;
  paymentsReady: boolean;
  subscriptionStatus: string | null;
  hasStripeCustomer: boolean;
  checkout: CheckoutOutcome;
  email: string | null;
  displayName: string | null;
}) {
  const toast = useToast();
  const router = useRouter();
  const params = useSearchParams();
  const [connectors, setConnectors] = useState<PublicConnector[]>(initial);
  const [ticketProvider, setTicketProviderState] = useState<TicketProvider | null>(initialTicketProvider);
  const [busy, setBusy] = useState<string | null>(null);
  const mayConnect = canConnect(tier);

  const byProvider = useMemo(() => new Map(connectors.map((c) => [c.provider, c])), [connectors]);
  const get = (p: Provider) => byProvider.get(p) ?? null;

  // A connect flow comes back with a code in the URL. Only a code we know is
  // shown, so a crafted link can't put its own words in a toast here.
  useEffect(() => {
    const error = params.get("error");
    const notice = params.get("notice");
    const flash = settingsFlash(error) ?? settingsFlash(notice);
    if (flash) toast(flash.text, flash.tone);
    if (error || notice) router.replace("/settings");
  }, [params, toast, router]);

  async function refresh() {
    try {
      const data = await getJson<{ connectors: PublicConnector[]; ticketProvider: TicketProvider | null }>("/api/connectors");
      setConnectors(data.connectors);
      setTicketProviderState(data.ticketProvider);
    } catch {
      /* the page still shows what it loaded with */
    }
  }

  async function disconnect(provider: Provider, label: string) {
    setBusy(provider);
    try {
      await deleteJson(`/api/connectors/${provider}`);
      toast(`${label} disconnected`, "ok");
      await refresh();
      router.refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not disconnect", "error");
    } finally {
      setBusy(null);
    }
  }

  async function chooseTicketProvider(next: TicketProvider | null) {
    const previous = ticketProvider;
    setTicketProviderState(next);
    try {
      await putJson("/api/settings/ticket-provider", { provider: next });
      toast(next ? `New follow-ups will start on ${next === "linear" ? "Linear" : "Jira"}.` : "New follow-ups will start on copy only.", "ok");
    } catch (err) {
      setTicketProviderState(previous);
      toast(err instanceof Error ? err.message : "Could not save that", "error");
    }
  }

  return (
    <section className="flex flex-col gap-6 pt-10">
      <PageHead title="Settings" meta="Your account, and the tools your approved work goes to." />

      <div className="glass rise p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-sm font-medium">
              Account
              <span className={`pill ${tier === "owner" ? "pill-live" : tier === "active" ? "pill-ok" : ""}`}>{TIER_LABEL[tier]}</span>
            </p>
            {email ? <p className="mt-1 truncate text-xs text-faint">{email}</p> : null}
            <p className="mt-1 text-xs text-muted">{TIER_BLURB[tier]}</p>
          </div>
        </div>
        <DisplayNameField initial={displayName} />
        <ThemeField initial={theme} />
      </div>

      <Billing
        tier={tier}
        paymentsReady={paymentsReady}
        subscriptionStatus={subscriptionStatus}
        hasStripeCustomer={hasStripeCustomer}
        checkout={checkout}
      />

      {!storageReady ? (
        <p className="glass border-danger/40 p-4 text-sm text-danger">
          The server has no credential encryption key set, so connections can&apos;t be saved yet. Set CREDENTIALS_KEY and redeploy.
        </p>
      ) : null}

      {/* Shown rather than hidden: somebody deciding whether to pay should be
          able to see the four apps they would be buying, not an absence. */}
      {!mayConnect ? <UpgradePanel reason="connect" title="Connected apps are part of Pro" /> : null}

      <div className="glass divide-y divide-panel-border overflow-hidden">
        <div className="px-5 py-3">
          <p className="text-sm font-medium">Connections</p>
          <p className="mt-0.5 text-xs text-muted">Where your approved notes and follow-ups go.</p>
        </div>
        <LinearCard locked={!mayConnect} oauthReady={oauthReady.linear} connector={get("linear")} busy={busy} setBusy={setBusy} onChanged={refresh} disconnect={disconnect} />
        <JiraCard locked={!mayConnect} oauthReady={oauthReady.jira} connector={get("jira")} busy={busy} setBusy={setBusy} onChanged={refresh} disconnect={disconnect} />
        <SlackCard locked={!mayConnect} oauthReady={oauthReady.slack} connector={get("slack")} busy={busy} setBusy={setBusy} onChanged={refresh} disconnect={disconnect} />
        <GoogleCard locked={!mayConnect} connector={get("google")} googleReady={googleReady} busy={busy} disconnect={disconnect} />
        <MicrosoftCard locked={!mayConnect} connector={get("microsoft")} microsoftReady={microsoftReady} busy={busy} disconnect={disconnect} onChanged={refresh} />
      </div>

      <DangerZone email={email} />

      {get("linear") || get("jira") ? (
        <div className="glass p-5">
          <p className="text-sm font-medium">Where follow-ups start</p>
          <p className="mt-1 text-xs text-muted">
            A starting point, not a rule: every follow-up shows where it is going and can be pointed somewhere
            else before you approve it. A meeting that names Linear or Jira out loud overrides this.
          </p>
          <div className="mt-3 flex gap-0.5 self-start rounded-lg border border-panel-border p-0.5">
            {[
              { key: null, label: "Copy only" },
              ...(get("linear") ? [{ key: "linear" as const, label: "Linear" }] : []),
              ...(get("jira") ? [{ key: "jira" as const, label: "Jira" }] : []),
            ].map((o) => (
              <button
                key={String(o.key)}
                onClick={() => chooseTicketProvider(o.key)}
                className={`rounded-md px-2.5 py-1 text-xs transition-colors ${
                  ticketProvider === o.key ? "bg-panel-hi font-medium text-fg" : "text-muted hover:text-fg"
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}

    </section>
  );
}

/**
 * What this account pays, and the two ways to change it.
 *
 * Both buttons only ever hand the browser to Stripe. Nothing about money is
 * decided here: the tier moves when Stripe's webhook arrives, so this page
 * reports what the account row says and never guesses ahead of it.
 */
function Billing({
  tier,
  paymentsReady,
  subscriptionStatus,
  hasStripeCustomer,
  checkout,
}: {
  tier: Tier;
  paymentsReady: boolean;
  subscriptionStatus: string | null;
  hasStripeCustomer: boolean;
  checkout: CheckoutOutcome;
}) {
  // The price is quoted from the same list the landing page reads, so the two
  // cannot drift apart.
  const pro = PLANS.find((p) => p.id === "pro");
  const perks = pro ? pro.features.slice(0, 4) : [];
  // "active" is the ordinary case and saying it adds nothing. Anything else is
  // worth showing plainly: somebody whose card is failing should see past_due
  // here rather than be told all is well.
  const oddStatus = subscriptionStatus && subscriptionStatus !== "active" ? subscriptionStatus : null;

  return (
    <div className="glass p-5">
      <p className="text-sm font-medium">Billing</p>

      {checkout === "done" ? (
        <p className="mt-3 rounded-lg border border-panel-border bg-panel-hi p-3 text-xs leading-relaxed text-muted">
          Payment received, thank you. Your account updates as soon as the payment provider confirms it, which is
          usually a few seconds. If it still says Free below, refresh this page.
        </p>
      ) : null}
      {checkout === "cancelled" ? (
        <p className="mt-3 rounded-lg border border-panel-border bg-panel-hi p-3 text-xs leading-relaxed text-muted">
          Checkout was cancelled and nothing was charged. Your account is unchanged.
        </p>
      ) : null}

      {tier === "owner" ? (
        <p className="mt-2 text-xs leading-relaxed text-muted">
          This account is an owner account, which is not billed. There is nothing to pay and nothing to manage here.
        </p>
      ) : tier === "active" ? (
        <>
          <p className="mt-2 text-xs leading-relaxed text-muted">
            You are on Pro: unlimited meetings, drafting, and the connected apps below.
          </p>
          {oddStatus ? (
            <p className="mt-2 text-xs text-warn">
              The payment provider reports this subscription as <span className="font-mono">{oddStatus}</span>. Check
              your card in the billing portal.
            </p>
          ) : null}
          <p className="mt-2 text-xs leading-relaxed text-muted">
            Changing your card, reading invoices and cancelling all happen in the payment provider&apos;s own portal,
            not here, so there is one record of what you are paying.
          </p>
          {paymentsReady && hasStripeCustomer ? (
            <ManageBillingButton className="btn btn-ghost mt-3" />
          ) : (
            <p className="mt-3 text-xs text-faint">
              {paymentsReady ? "There's nothing to manage on this account yet." : NO_PAYMENTS}
            </p>
          )}
        </>
      ) : (
        <>
          <p className="mt-2 text-xs leading-relaxed text-muted">
            You are on Free. Pro is {pro?.price}
            {pro?.cadence} per person, and adds:
          </p>
          <ul className="mt-2 flex flex-col gap-1 text-xs text-muted">
            {perks.map((perk) => (
              <li key={perk}>· {perk}</li>
            ))}
          </ul>
          <p className="mt-2 text-xs leading-relaxed text-muted">
            You can cancel any time from the payment provider&apos;s own portal, which appears here once you subscribe.
          </p>
          {paymentsReady ? (
            <UpgradeButton className="btn btn-primary mt-3" />
          ) : (
            <p className="mt-3 text-xs text-faint">{NO_PAYMENTS}</p>
          )}
        </>
      )}
    </div>
  );
}

const NO_PAYMENTS = "Payments aren't set up on this server yet, so there is nothing to buy here.";

/**
 * Which surface the app is rendered on.
 *
 * The choice is stored on the account, not in this browser, so it follows the
 * person to their other machines and so the server can stamp it on <html>
 * before anything paints. The switch is applied to the document immediately
 * and saved behind that: waiting for a round trip to change a colour is the
 * kind of lag people notice.
 */
function ThemeField({ initial }: { initial: Theme }) {
  const toast = useToast();
  const [theme, setTheme] = useState<Theme>(initial);
  const [busy, setBusy] = useState(false);

  // The document follows the state rather than being written to inside the
  // handler, so a failed save reverting the state also reverts the screen.
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  async function choose(next: Theme) {
    if (next === theme || busy) return;
    const previous = theme;
    setTheme(next);
    setBusy(true);
    try {
      await putJson<{ theme: Theme }>("/api/settings/theme", { theme: next });
    } catch (err) {
      // Put it back rather than leaving the screen disagreeing with what is
      // actually stored.
      setTheme(previous);
      toast(err instanceof Error ? err.message : "Could not save your choice", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 border-t border-panel-border pt-4">
      <p className="text-sm font-medium">Appearance</p>
      <p className="mt-1 text-xs text-muted">
        Saved to your account, so it follows you to any machine you sign in on.
      </p>
      <div className="seg mt-3" role="group" aria-label="Appearance">
        {(["dark", "light"] as const).map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={theme === option}
            disabled={busy}
            onClick={() => choose(option)}
          >
            {option === "dark" ? "Dark" : "Light"}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * The name the notes use for this person. Their own voice is already found
 * from the microphone; the name is what lets the notes catch other people
 * saying it, and what goes on their lines in the transcript.
 */
function DisplayNameField({ initial }: { initial: string | null }) {
  const toast = useToast();
  const [name, setName] = useState(initial ?? "");
  const [saved, setSaved] = useState(initial ?? "");
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      const res = await putJson<{ name: string | null }>("/api/settings/display-name", { name });
      setName(res.name ?? "");
      setSaved(res.name ?? "");
      toast(res.name ? `Your notes will call you ${res.name}.` : "Name cleared. Your notes will say “You”.", "ok");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not save your name", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 border-t border-panel-border pt-4">
      <label className="text-sm font-medium" htmlFor="display-name">
        Your name, as people say it in meetings
      </label>
      <p className="mt-1 text-xs text-muted">
        Your own voice is already picked out from your microphone. A name lets the notes catch when someone
        else says it, and puts it on your lines in the transcript.
      </p>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <input
          id="display-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your first name"
          maxLength={60}
          className="field text-sm sm:max-w-xs"
        />
        <button className="btn btn-primary" disabled={busy || name.trim() === saved} onClick={save}>
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}

/**
 * Deleting the account, for good.
 *
 * Guarded by typing the email address rather than a checkbox, because this is
 * the one action in the product with nothing behind it: no trash, no undo, no
 * copy on our side to restore from. The same confirmation is checked on the
 * server, so the guard is real rather than decorative.
 */
function DangerZone({ email }: { email: string | null }) {
  const toast = useToast();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const matches = !!email && typed.trim().toLowerCase() === email.toLowerCase();

  async function remove() {
    setBusy(true);
    try {
      const res = await deleteJsonWithBody<{ audioFilesRemoved: number }>("/api/account", { confirm: typed.trim() });
      toast(`Account deleted, along with ${res.audioFilesRemoved} recording${res.audioFilesRemoved === 1 ? "" : "s"}.`, "ok");
      // Nothing left to be signed in to. Any token still held is worthless:
      // the account it belonged to no longer exists, so the server rejects it.
      router.replace("/");
      router.refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not delete your account", "error");
      setBusy(false);
    }
  }

  return (
    <div className="glass border-danger/40 p-5">
      <p className="text-sm font-medium">Delete your account</p>
      <p className="mt-1 text-xs leading-relaxed text-muted">
        Removes your recordings, notes, tasks, drafts and connections, and the audio itself. It cannot be undone
        and we keep no copy to restore from.
      </p>

      {!open ? (
        <button className="btn btn-danger mt-3" onClick={() => setOpen(true)}>
          Delete account
        </button>
      ) : (
        <div className="mt-4 flex flex-col gap-2 border-t border-panel-border pt-4">
          <label className="text-xs text-muted" htmlFor="confirm-delete">
            Type <span className="font-medium text-fg">{email}</span> to confirm.
          </label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              id="confirm-delete"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
              className="field text-sm sm:max-w-xs"
            />
            <button className="btn btn-danger" disabled={!matches || busy} onClick={remove}>
              {busy ? "Deleting…" : "Delete everything"}
            </button>
            <button className="btn btn-ghost" disabled={busy} onClick={() => { setOpen(false); setTyped(""); }}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---- shared bits ------------------------------------------------------------

type CardProps = {
  connector: PublicConnector | null;
  busy: string | null;
  setBusy: (v: string | null) => void;
  onChanged: () => Promise<void>;
  disconnect: (p: Provider, label: string) => Promise<void>;
  /** The tier cannot connect anything, so every way in is dead on this row. */
  locked: boolean;
};

/**
 * One integration, as a row rather than a card.
 *
 * The row always reads the same way: what it is, what it does, and one control
 * on the right. Anything fiddly (an API key, a project picker) only appears
 * once you ask for it, so the page is a short list instead of a wall of forms.
 */
function Row({
  provider,
  title,
  connected,
  detail,
  error,
  action,
  children,
}: {
  provider: Provider;
  title: string;
  connected: boolean;
  detail?: string;
  error?: string | null;
  action: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="px-5 py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <BrandMark provider={provider} />
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-sm font-medium">
              {title}
              {connected ? <span className="pill pill-ok">connected</span> : null}
            </p>
            <p className="mt-0.5 truncate text-xs text-muted">{detail ?? PROVIDER_PURPOSE[provider]}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">{action}</div>
      </div>
      {error ? <p className="mt-2 pl-14 text-xs text-danger">{error}</p> : null}
      {children ? <div className="mt-3 pl-14">{children}</div> : null}
    </div>
  );
}

/**
 * Starts a provider's consent flow. Deliberately a plain anchor: these endpoints
 * redirect out to the provider's own screen, which next/link cannot do.
 */
function ConnectButton({ href, label = "Connect", locked = false }: { href: string; label?: string; locked?: boolean }) {
  // A disabled anchor is not a thing, so a locked row gets a real disabled
  // button. The shape of the row stays the same, which is the point: the
  // control is visibly there and visibly unavailable.
  if (locked) {
    return (
      <button type="button" disabled className="btn btn-primary !py-1.5 text-xs">
        {label}
      </button>
    );
  }
  return (
    <a className="btn btn-primary !py-1.5 text-xs" href={href}>
      {label}
    </a>
  );
}

function DisconnectButton({ onClick, busy }: { onClick: () => void; busy: boolean }) {
  return (
    <button className="btn btn-ghost !py-1.5 text-xs text-muted hover:!text-danger" disabled={busy} onClick={onClick}>
      Disconnect
    </button>
  );
}

/**
 * The manual fallback, folded away. It only exists for the case where no OAuth
 * app has been registered for this provider yet, and it should never be the
 * first thing a customer sees.
 */
function Manual({ label, children }: { label: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button className="text-xs text-faint underline underline-offset-2 transition-colors hover:text-fg" onClick={() => setOpen(true)}>
        {label}
      </button>
    );
  }
  return <div className="flex flex-col gap-2">{children}</div>;
}

/** Shown when the server has no OAuth app registered for a provider yet. */
function NotSetUp({ what }: { what: string }) {
  return <span className="text-xs text-faint">Needs {what} on the server</span>;
}

// ---- Linear -----------------------------------------------------------------

function LinearCard({ connector, busy, setBusy, onChanged, disconnect, oauthReady, locked }: CardProps & { oauthReady: boolean }) {
  const toast = useToast();
  const [apiKey, setApiKey] = useState("");
  const [teams, setTeams] = useState<Team[]>([]);
  const config = (connector?.config ?? {}) as { teamId?: string; teamName?: string };
  const working = busy === "linear";

  async function connect() {
    setBusy("linear");
    try {
      const res = await postJson<{ teams: Team[] }>("/api/connectors/linear", { apiKey });
      setApiKey("");
      setTeams(res.teams);
      toast("Linear connected", "ok");
      await onChanged();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not connect Linear", "error");
    } finally {
      setBusy(null);
    }
  }

  async function loadTeams() {
    try {
      const res = await getJson<{ teams: Team[] }>("/api/connectors/linear");
      setTeams(res.teams);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not load teams", "error");
    }
  }

  async function pickTeam(teamId: string) {
    setBusy("linear");
    try {
      await patchJson("/api/connectors/linear", { teamId });
      toast("Team saved", "ok");
      await onChanged();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not save that team", "error");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Row
      provider="linear"
      title="Linear"
      connected={!!connector}
      error={connector?.lastError}
      detail={config.teamName ? `Issues go to the ${config.teamName} team.` : undefined}
      action={
        connector ? (
          <DisconnectButton busy={working} onClick={() => disconnect("linear", "Linear")} />
        ) : locked ? (
          <ConnectButton href="/api/connectors/linear/start" locked />
        ) : oauthReady ? (
          <ConnectButton href="/api/connectors/linear/start" />
        ) : (
          <NotSetUp what="LINEAR_CLIENT_ID" />
        )
      }
    >
      {connector ? (
        teams.length > 0 ? (
          <select value={config.teamId ?? ""} onChange={(e) => pickTeam(e.target.value)} className="field max-w-xs text-sm" aria-label="Linear team">
            <option value="" disabled>Pick a team</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        ) : (
          <button className="btn btn-ghost !py-1.5 text-xs" onClick={loadTeams}>
            {config.teamName ? "Change team" : "Choose a team"}
          </button>
        )
      ) : !oauthReady && !locked ? (
        <Manual label="Use an API key instead">
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="lin_api_…"
              className="field text-sm"
              aria-label="Linear API key"
            />
            <button className="btn btn-primary" disabled={working || !apiKey.trim()} onClick={connect}>
              {working ? "Checking…" : "Connect"}
            </button>
          </div>
          <p className="text-xs text-faint">Linear &rarr; Settings &rarr; Account &rarr; Security &amp; access &rarr; API.</p>
        </Manual>
      ) : null}
    </Row>
  );
}

// ---- Jira -------------------------------------------------------------------

function JiraCard({ connector, busy, setBusy, onChanged, disconnect, oauthReady, locked }: CardProps & { oauthReady: boolean }) {
  const toast = useToast();
  const [form, setForm] = useState({ siteUrl: "", email: "", apiToken: "" });
  const [projects, setProjects] = useState<Project[]>([]);
  const config = (connector?.config ?? {}) as { projectKey?: string; projectName?: string; issueType?: string };
  const working = busy === "jira";

  async function connect() {
    setBusy("jira");
    try {
      const res = await postJson<{ projects: Project[] }>("/api/connectors/jira", form);
      setForm({ siteUrl: "", email: "", apiToken: "" });
      setProjects(res.projects);
      toast("Jira connected", "ok");
      await onChanged();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not connect Jira", "error");
    } finally {
      setBusy(null);
    }
  }

  async function loadProjects() {
    try {
      const res = await getJson<{ projects: Project[] }>("/api/connectors/jira");
      setProjects(res.projects);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not load projects", "error");
    }
  }

  async function pickProject(projectKey: string) {
    setBusy("jira");
    try {
      await patchJson("/api/connectors/jira", { projectKey, issueType: config.issueType ?? "Task" });
      toast("Project saved", "ok");
      await onChanged();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not save that project", "error");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Row
      provider="jira"
      title="Jira"
      connected={!!connector}
      error={connector?.lastError}
      detail={config.projectKey ? `Issues go to ${config.projectName ?? config.projectKey} as ${config.issueType ?? "Task"}.` : undefined}
      action={
        connector ? (
          <DisconnectButton busy={working} onClick={() => disconnect("jira", "Jira")} />
        ) : locked ? (
          <ConnectButton href="/api/connectors/jira/start" locked />
        ) : oauthReady ? (
          <ConnectButton href="/api/connectors/jira/start" />
        ) : (
          <NotSetUp what="JIRA_CLIENT_ID" />
        )
      }
    >
      {connector ? (
        projects.length > 0 ? (
          <select value={config.projectKey ?? ""} onChange={(e) => pickProject(e.target.value)} className="field max-w-xs text-sm" aria-label="Jira project">
            <option value="" disabled>Pick a project</option>
            {projects.map((p) => (
              <option key={p.id} value={p.key}>{p.name} ({p.key})</option>
            ))}
          </select>
        ) : (
          <button className="btn btn-ghost !py-1.5 text-xs" onClick={loadProjects}>
            {config.projectKey ? "Change project" : "Choose a project"}
          </button>
        )
      ) : !oauthReady && !locked ? (
        <Manual label="Use an API token instead">
          <input value={form.siteUrl} onChange={(e) => setForm({ ...form, siteUrl: e.target.value })} placeholder="acme.atlassian.net" className="field text-sm" aria-label="Jira site" />
          <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="you@company.com" className="field text-sm" aria-label="Jira email" />
          <input type="password" value={form.apiToken} onChange={(e) => setForm({ ...form, apiToken: e.target.value })} placeholder="API token" className="field text-sm" aria-label="Jira API token" />
          <button className="btn btn-primary self-start" disabled={working} onClick={connect}>
            {working ? "Checking…" : "Connect"}
          </button>
          <p className="text-xs text-faint">Create a token at id.atlassian.com &rarr; Security &rarr; API tokens.</p>
        </Manual>
      ) : null}
    </Row>
  );
}

// ---- Slack ------------------------------------------------------------------

function SlackCard({ connector, busy, setBusy, onChanged, disconnect, oauthReady, locked }: CardProps & { oauthReady: boolean }) {
  const toast = useToast();
  const [webhookUrl, setWebhookUrl] = useState("");
  const working = busy === "slack";

  async function connect() {
    setBusy("slack");
    try {
      await postJson("/api/connectors/slack", { webhookUrl });
      setWebhookUrl("");
      toast("Slack connected. Check the channel for a test message.", "ok");
      await onChanged();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not connect Slack", "error");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Row
      provider="slack"
      title="Slack"
      connected={!!connector}
      error={connector?.lastError}
      detail={connector ? "Posting to the channel this connection was made for." : undefined}
      action={
        connector ? (
          <DisconnectButton busy={working} onClick={() => disconnect("slack", "Slack")} />
        ) : locked ? (
          <ConnectButton href="/api/connectors/slack/start" locked />
        ) : oauthReady ? (
          <ConnectButton href="/api/connectors/slack/start" />
        ) : (
          <NotSetUp what="SLACK_CLIENT_ID" />
        )
      }
    >
      {!connector && !oauthReady && !locked ? (
        <Manual label="Use a webhook URL instead">
          <div className="flex flex-col gap-2 sm:flex-row">
            <input value={webhookUrl} onChange={(e) => setWebhookUrl(e.target.value)} placeholder="https://hooks.slack.com/services/…" className="field text-sm" aria-label="Slack webhook URL" />
            <button className="btn btn-primary" disabled={working || !webhookUrl.trim()} onClick={connect}>
              {working ? "Testing…" : "Connect"}
            </button>
          </div>
          <p className="text-xs text-faint">
            Slack &rarr; your app &rarr; Incoming Webhooks &rarr; Add New Webhook. You pick the channel there. We post a test message to confirm it works.
          </p>
        </Manual>
      ) : null}
    </Row>
  );
}

// ---- Google -----------------------------------------------------------------

/**
 * One card for the whole Microsoft account, because it is one consent covering
 * Outlook, Teams, Planner, SharePoint and Excel. What it can actually do is
 * read back from the scopes that were granted rather than assumed: at a
 * company, Teams and SharePoint are routinely withheld until an IT admin
 * approves them, so a half-working connection is a normal state that has to be
 * legible rather than an error.
 */
/**
 * Which workbook a meeting's tasks get appended to.
 *
 * Chosen from what is already in OneDrive rather than created: Graph's
 * workbook APIs refuse an empty file, so making one would mean shipping a
 * binary .xlsx and uploading it. Pressing New > Excel workbook once is a
 * smaller ask than that, and the empty state says so.
 */
function WorkbookPicker({ current, onChanged }: { current: string | null; onChanged: () => void }) {
  const toast = useToast();
  const [list, setList] = useState<{ id: string; name: string }[] | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    setBusy(true);
    try {
      const { workbooks } = await getJson<{ workbooks: { id: string; name: string }[] }>(
        "/api/connectors/microsoft/workbook",
      );
      setList(workbooks);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not read your OneDrive", "error");
    } finally {
      setBusy(false);
    }
  }

  async function choose(id: string, name: string) {
    setBusy(true);
    try {
      await putJson("/api/connectors/microsoft/workbook", { id, name });
      setList(null);
      onChanged();
      toast(`Tasks will be added to ${name}.`, "ok");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not save that", "error");
    } finally {
      setBusy(false);
    }
  }

  if (list) {
    return list.length === 0 ? (
      <p className="text-xs text-muted">
        No spreadsheets found in your OneDrive. Make one first — in OneDrive, New &rarr; Excel workbook — then choose it
        here.
      </p>
    ) : (
      <div className="flex flex-wrap gap-2">
        {list.slice(0, 12).map((w) => (
          <button key={w.id} onClick={() => choose(w.id, w.name)} disabled={busy} className="btn btn-ghost !py-1.5 text-xs">
            {w.name}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button onClick={load} disabled={busy} className="btn btn-ghost !py-1.5 text-xs">
        {busy ? "Looking…" : current ? "Change workbook" : "Choose a workbook"}
      </button>
      <span className="text-xs text-faint">
        {current ? `Tasks are added to ${current}.` : "Where a meeting's tasks get appended."}
      </span>
    </div>
  );
}

function MicrosoftCard({
  connector,
  microsoftReady,
  busy,
  disconnect,
  locked,
  onChanged,
}: {
  connector: PublicConnector | null;
  microsoftReady: boolean;
  busy: string | null;
  disconnect: (p: Provider, label: string) => Promise<void>;
  locked: boolean;
  onChanged: () => void;
}) {
  const config = (connector?.config ?? {}) as {
    scopes?: string[];
    email?: string;
    name?: string;
    personal?: boolean;
    workbookName?: string;
  };
  const scopes = config.scopes ?? [];
  const personal = !!config.personal;
  const on = PRODUCTS.filter((p) => scopes.includes(p.scope));
  // Not "not granted yet" but "asked for separately". Teams and SharePoint
  // reach organisation-wide resources, so they are requested one at a time and
  // only where they could work at all.
  const canEnable = enableableProducts(scopes, personal);

  return (
    <Row
      provider="microsoft"
      title="Microsoft"
      connected={!!connector}
      error={connector?.lastError}
      detail={connector ? `${config.email ?? config.name ?? "Connected"} · ${on.map((p) => p.label).join(", ") || "nothing enabled yet"}.` : undefined}
      action={
        locked && !connector ? (
          <ConnectButton href="/api/connectors/microsoft/start" locked />
        ) : !microsoftReady ? (
          <NotSetUp what="MICROSOFT_CLIENT_ID" />
        ) : !connector ? (
          <ConnectButton href="/api/connectors/microsoft/start" />
        ) : (
          <>
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a className="btn btn-ghost !py-1.5 text-xs" href="/api/connectors/microsoft/start">
              Reconnect
            </a>
            <DisconnectButton busy={busy === "microsoft"} onClick={() => disconnect("microsoft", "Microsoft")} />
          </>
        )
      }
    >
      {connector && personal ? (
        <p className="text-xs text-muted">
          This is a personal Microsoft account, so Teams and SharePoint are not available on it — those are Microsoft 365
          work and school products, and there are no channels or sites for them to reach.
        </p>
      ) : null}
      {connector && scopes.includes("Files.ReadWrite") ? (
        <WorkbookPicker current={config.workbookName ?? null} onChanged={onChanged} />
      ) : null}
      {connector && canEnable.length > 0 ? (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-muted">
            Teams and SharePoint reach things the whole organisation shares, so they are asked for separately. Your IT admin
            may have to approve them once, for everybody.
          </p>
          <div className="flex flex-wrap gap-2">
            {canEnable.map((key) => (
              // A plain anchor: this redirects out to Microsoft's own consent
              // screen, which next/link cannot do.
              <a key={key} className="btn btn-ghost !py-1.5 text-xs" href={`/api/connectors/microsoft/start?add=${key}`}>
                Enable {key === "teams" ? "Teams" : "SharePoint"}
              </a>
            ))}
          </div>
        </div>
      ) : null}
    </Row>
  );
}

function GoogleCard({
  connector,
  googleReady,
  busy,
  disconnect,
  locked,
}: {
  connector: PublicConnector | null;
  googleReady: boolean;
  busy: string | null;
  disconnect: (p: Provider, label: string) => Promise<void>;
  locked: boolean;
}) {
  const scopes = ((connector?.config ?? {}) as { scopes?: string[] }).scopes ?? [];
  const canSend = scopes.some((s) => s.includes("gmail.send"));
  // The read-only calendar scope was what earlier connections got; adding events
  // needs the read-write one, so an old connection has to be reconnected.
  const canWriteCalendar = scopes.some((s) => s.endsWith("/auth/calendar.events") || s.endsWith("/auth/calendar"));
  const stale = !!connector && !canWriteCalendar;

  return (
    <Row
      provider="google"
      title="Google"
      connected={!!connector}
      error={connector?.lastError}
      detail={
        connector
          ? `${canSend ? "Can send email" : "Cannot send email"} · ${canWriteCalendar ? "can add calendar events" : "cannot add calendar events"}.`
          : undefined
      }
      action={
        locked && !connector ? (
          <ConnectButton href="/api/connectors/google/start" locked />
        ) : !googleReady ? (
          <NotSetUp what="GOOGLE_CLIENT_ID" />
        ) : !connector ? (
          <ConnectButton href="/api/connectors/google/start" />
        ) : (
          <>
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a className={`btn ${stale ? "btn-primary" : "btn-ghost"} !py-1.5 text-xs`} href="/api/connectors/google/start">
              Reconnect
            </a>
            <DisconnectButton busy={busy === "google"} onClick={() => disconnect("google", "Google")} />
          </>
        )
      }
    >
      {stale ? (
        <p className="text-xs text-warn">
          This connection was made before calendar writing was added. Reconnect to let From the Call block tasks out on your calendar.
        </p>
      ) : null}
    </Row>
  );
}
