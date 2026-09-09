"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { deleteJson, getJson, patchJson, postJson, putJson } from "@/lib/upload";
import { useToast } from "@/components/toast";
import { PROVIDER_PURPOSE, type PublicConnector, type Provider, type TicketProvider } from "@/lib/connectors";
import { BrandMark } from "@/components/brand-marks";
import { canUseAi, TIER_BLURB, TIER_LABEL, type Tier } from "@/lib/account";

type Team = { id: string; name: string };
type Project = { id: string; key: string; name: string };

export default function SettingsView({
  initial,
  initialTicketProvider,
  storageReady,
  googleReady,
  oauthReady,
  tier,
  email,
  displayName,
}: {
  initial: PublicConnector[];
  initialTicketProvider: TicketProvider | null;
  storageReady: boolean;
  googleReady: boolean;
  oauthReady: { linear: boolean; jira: boolean; slack: boolean };
  tier: Tier;
  email: string | null;
  displayName: string | null;
}) {
  const toast = useToast();
  const router = useRouter();
  const params = useSearchParams();
  const [connectors, setConnectors] = useState<PublicConnector[]>(initial);
  const [ticketProvider, setTicketProviderState] = useState<TicketProvider | null>(initialTicketProvider);
  const [busy, setBusy] = useState<string | null>(null);

  const byProvider = useMemo(() => new Map(connectors.map((c) => [c.provider, c])), [connectors]);
  const get = (p: Provider) => byProvider.get(p) ?? null;

  // The Google callback comes back with a message in the URL.
  useEffect(() => {
    const error = params.get("error");
    const notice = params.get("notice");
    if (error) toast(error, "error");
    else if (notice) toast(notice, "ok");
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
      toast(next ? `Approved tickets will go to ${next === "linear" ? "Linear" : "Jira"}.` : "Approved tickets stay copy-and-paste.", "ok");
    } catch (err) {
      setTicketProviderState(previous);
      toast(err instanceof Error ? err.message : "Could not save that", "error");
    }
  }

  return (
    <section className="flex flex-col gap-6 pt-10">
      <div className="rise">
        <h1 className="text-3xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-muted">Your account, and the tools your approved work goes to.</p>
      </div>

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
        {!canUseAi(tier) ? (
          <p className="mt-3 border-t border-panel-border pt-3 text-xs text-warn">
            Recording and AI notes are turned off for free accounts. Everything already in your account stays readable.
          </p>
        ) : null}
        <DisplayNameField initial={displayName} />
      </div>

      {!storageReady ? (
        <p className="glass border-danger/40 p-4 text-sm text-danger">
          The server has no credential encryption key set, so connections can&apos;t be saved yet. Set CREDENTIALS_KEY and redeploy.
        </p>
      ) : null}

      <div className="glass divide-y divide-panel-border overflow-hidden">
        <div className="px-5 py-3">
          <p className="text-sm font-medium">Connections</p>
          <p className="mt-0.5 text-xs text-muted">Where your approved notes, tickets and follow-ups go.</p>
        </div>
        <LinearCard oauthReady={oauthReady.linear} connector={get("linear")} busy={busy} setBusy={setBusy} onChanged={refresh} disconnect={disconnect} />
        <JiraCard oauthReady={oauthReady.jira} connector={get("jira")} busy={busy} setBusy={setBusy} onChanged={refresh} disconnect={disconnect} />
        <SlackCard oauthReady={oauthReady.slack} connector={get("slack")} busy={busy} setBusy={setBusy} onChanged={refresh} disconnect={disconnect} />
        <GoogleCard connector={get("google")} googleReady={googleReady} busy={busy} disconnect={disconnect} />
      </div>

      {get("linear") || get("jira") ? (
        <div className="glass p-5">
          <p className="text-sm font-medium">Where approved tickets go</p>
          <p className="mt-1 text-xs text-muted">
            Approving a ticket creates it here. Leave it off and approving just marks it ready to copy.
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

// ---- shared bits ------------------------------------------------------------

type CardProps = {
  connector: PublicConnector | null;
  busy: string | null;
  setBusy: (v: string | null) => void;
  onChanged: () => Promise<void>;
  disconnect: (p: Provider, label: string) => Promise<void>;
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
function ConnectButton({ href, label = "Connect" }: { href: string; label?: string }) {
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

function LinearCard({ connector, busy, setBusy, onChanged, disconnect, oauthReady }: CardProps & { oauthReady: boolean }) {
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
      ) : !oauthReady ? (
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

function JiraCard({ connector, busy, setBusy, onChanged, disconnect, oauthReady }: CardProps & { oauthReady: boolean }) {
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
      ) : !oauthReady ? (
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

function SlackCard({ connector, busy, setBusy, onChanged, disconnect, oauthReady }: CardProps & { oauthReady: boolean }) {
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
        ) : oauthReady ? (
          <ConnectButton href="/api/connectors/slack/start" />
        ) : (
          <NotSetUp what="SLACK_CLIENT_ID" />
        )
      }
    >
      {!connector && !oauthReady ? (
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

function GoogleCard({
  connector,
  googleReady,
  busy,
  disconnect,
}: {
  connector: PublicConnector | null;
  googleReady: boolean;
  busy: string | null;
  disconnect: (p: Provider, label: string) => Promise<void>;
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
        !googleReady ? (
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
