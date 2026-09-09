"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { deleteJson, getJson, patchJson, postJson, putJson } from "@/lib/upload";
import { useToast } from "@/components/toast";
import { PROVIDER_PURPOSE, type PublicConnector, type Provider, type TicketProvider } from "@/lib/connectors";
import { canUseAi, TIER_BLURB, TIER_LABEL, type Tier } from "@/lib/account";

type Team = { id: string; name: string };
type Project = { id: string; key: string; name: string };

export default function SettingsView({
  initial,
  initialTicketProvider,
  storageReady,
  googleReady,
  tier,
  email,
}: {
  initial: PublicConnector[];
  initialTicketProvider: TicketProvider | null;
  storageReady: boolean;
  googleReady: boolean;
  tier: Tier;
  email: string | null;
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
      </div>

      {!storageReady ? (
        <p className="glass border-danger/40 p-4 text-sm text-danger">
          The server has no credential encryption key set, so connections can&apos;t be saved yet. Set CREDENTIALS_KEY and redeploy.
        </p>
      ) : null}

      <div className="flex flex-col gap-3">
        <LinearCard connector={get("linear")} busy={busy} setBusy={setBusy} onChanged={refresh} disconnect={disconnect} />
        <JiraCard connector={get("jira")} busy={busy} setBusy={setBusy} onChanged={refresh} disconnect={disconnect} />

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

        <SlackCard connector={get("slack")} busy={busy} setBusy={setBusy} onChanged={refresh} disconnect={disconnect} />
        <GoogleCard connector={get("google")} googleReady={googleReady} busy={busy} disconnect={disconnect} />
      </div>
    </section>
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

function Shell({
  provider,
  title,
  connected,
  detail,
  error,
  children,
  onDisconnect,
  busy,
}: {
  provider: Provider;
  title: string;
  connected: boolean;
  detail?: string;
  error?: string | null;
  children: React.ReactNode;
  onDisconnect?: () => void;
  busy: boolean;
}) {
  return (
    <div className="glass p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-medium">
            {title}
            {connected ? <span className="pill pill-ok">connected</span> : null}
          </p>
          <p className="mt-1 text-xs text-muted">{detail ?? PROVIDER_PURPOSE[provider]}</p>
        </div>
        {connected && onDisconnect ? (
          <button className="btn btn-ghost !py-1.5 text-xs text-muted hover:!text-danger" disabled={busy} onClick={onDisconnect}>
            Disconnect
          </button>
        ) : null}
      </div>
      {error ? <p className="mt-3 text-xs text-danger">{error}</p> : null}
      <div className="mt-4">{children}</div>
    </div>
  );
}

// ---- Linear -----------------------------------------------------------------

function LinearCard({ connector, busy, setBusy, onChanged, disconnect }: CardProps) {
  const toast = useToast();
  const [apiKey, setApiKey] = useState("");
  const [teams, setTeams] = useState<Team[]>([]);
  const config = (connector?.config ?? {}) as { teamId?: string; teamName?: string };

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
    <Shell
      provider="linear"
      title="Linear"
      connected={!!connector}
      error={connector?.lastError}
      busy={busy === "linear"}
      onDisconnect={() => disconnect("linear", "Linear")}
      detail={config.teamName ? `Issues go to the ${config.teamName} team.` : undefined}
    >
      {!connector ? (
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="lin_api_…"
            className="field text-sm"
            aria-label="Linear API key"
          />
          <button className="btn btn-primary" disabled={busy === "linear" || !apiKey.trim()} onClick={connect}>
            {busy === "linear" ? "Checking…" : "Connect"}
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          {teams.length > 0 ? (
            <select
              value={config.teamId ?? ""}
              onChange={(e) => pickTeam(e.target.value)}
              className="field max-w-xs text-sm"
              aria-label="Linear team"
            >
              <option value="" disabled>Pick a team</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          ) : (
            <button className="btn btn-ghost !py-1.5 text-xs" onClick={loadTeams}>
              {config.teamName ? "Change team" : "Choose a team"}
            </button>
          )}
        </div>
      )}
      {!connector ? (
        <p className="mt-2 text-xs text-faint">Linear → Settings → Account → Security &amp; access → API.</p>
      ) : null}
    </Shell>
  );
}

// ---- Jira -------------------------------------------------------------------

function JiraCard({ connector, busy, setBusy, onChanged, disconnect }: CardProps) {
  const toast = useToast();
  const [form, setForm] = useState({ siteUrl: "", email: "", apiToken: "" });
  const [projects, setProjects] = useState<Project[]>([]);
  const config = (connector?.config ?? {}) as { projectKey?: string; projectName?: string; issueType?: string };

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
    <Shell
      provider="jira"
      title="Jira"
      connected={!!connector}
      error={connector?.lastError}
      busy={busy === "jira"}
      onDisconnect={() => disconnect("jira", "Jira")}
      detail={config.projectKey ? `Issues go to ${config.projectName ?? config.projectKey} as ${config.issueType ?? "Task"}.` : undefined}
    >
      {!connector ? (
        <div className="flex flex-col gap-2">
          <input value={form.siteUrl} onChange={(e) => setForm({ ...form, siteUrl: e.target.value })} placeholder="acme.atlassian.net" className="field text-sm" aria-label="Jira site" />
          <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="you@company.com" className="field text-sm" aria-label="Jira email" />
          <input type="password" value={form.apiToken} onChange={(e) => setForm({ ...form, apiToken: e.target.value })} placeholder="API token" className="field text-sm" aria-label="Jira API token" />
          <button className="btn btn-primary self-start" disabled={busy === "jira"} onClick={connect}>
            {busy === "jira" ? "Checking…" : "Connect"}
          </button>
          <p className="text-xs text-faint">Create a token at id.atlassian.com → Security → API tokens.</p>
        </div>
      ) : projects.length > 0 ? (
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
      )}
    </Shell>
  );
}

// ---- Slack ------------------------------------------------------------------

function SlackCard({ connector, busy, setBusy, onChanged, disconnect }: CardProps) {
  const toast = useToast();
  const [webhookUrl, setWebhookUrl] = useState("");

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
    <Shell provider="slack" title="Slack" connected={!!connector} error={connector?.lastError} busy={busy === "slack"} onDisconnect={() => disconnect("slack", "Slack")}>
      {!connector ? (
        <div className="flex flex-col gap-2">
          <div className="flex flex-col gap-2 sm:flex-row">
            <input value={webhookUrl} onChange={(e) => setWebhookUrl(e.target.value)} placeholder="https://hooks.slack.com/services/…" className="field text-sm" aria-label="Slack webhook URL" />
            <button className="btn btn-primary" disabled={busy === "slack" || !webhookUrl.trim()} onClick={connect}>
              {busy === "slack" ? "Testing…" : "Connect"}
            </button>
          </div>
          <p className="text-xs text-faint">
            Slack → your app → Incoming Webhooks → Add New Webhook. The channel is chosen there. We post a test message to confirm it works.
          </p>
        </div>
      ) : (
        <p className="text-xs text-muted">Posting to the channel this webhook was created for.</p>
      )}
    </Shell>
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
    <Shell
      provider="google"
      title="Google"
      connected={!!connector}
      error={connector?.lastError}
      busy={busy === "google"}
      onDisconnect={() => disconnect("google", "Google")}
      detail={
        connector
          ? `${canSend ? "Can send email" : "Cannot send email"} · ${canWriteCalendar ? "can add calendar events" : "cannot add calendar events"}.`
          : undefined
      }
    >
      {!googleReady ? (
        <p className="text-xs text-muted">
          Google isn&apos;t set up on this server yet. It needs a Google Cloud OAuth client, then GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.
        </p>
      ) : !connector ? (
        // A real navigation, not a client-side route: this endpoint redirects
        // out to Google's consent screen, which next/link cannot do.
        // eslint-disable-next-line @next/next/no-html-link-for-pages
        <a className="btn btn-primary" href="/api/connectors/google/start">Connect Google</a>
      ) : (
        <div className="flex flex-col gap-2">
          {stale ? (
            <p className="text-xs text-warn">
              This connection was made before calendar writing was added. Reconnect to let Meetnote block tasks out on your calendar.
            </p>
          ) : null}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a className={`btn ${stale ? "btn-primary" : "btn-ghost"} self-start !py-1.5 text-xs`} href="/api/connectors/google/start">
            Reconnect
          </a>
        </div>
      )}
    </Shell>
  );
}
