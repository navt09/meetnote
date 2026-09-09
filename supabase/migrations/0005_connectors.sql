-- Third-party connections a customer sets up: where approved work gets sent,
-- and optionally their own LLM key.
--
-- Credentials are encrypted by the application before they get here (AES-256-GCM,
-- see src/lib/crypto.ts) so a database dump alone does not hand over anyone's
-- Linear or Google account. They are never returned to the browser.
-- Safe to run more than once.

create table if not exists public.connectors (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  provider      text not null check (provider in ('linear', 'jira', 'slack', 'google', 'llm')),

  -- Encrypted blob. Opaque to the database; only the server can read it.
  credentials   text not null,

  -- Non-secret settings safe to show the user: chosen team, project key,
  -- channel name, model name, connected account email.
  config        jsonb not null default '{}'::jsonb,

  -- Set when a call to the provider last failed, so the UI can prompt a reconnect.
  last_error    text,
  last_used_at  timestamptz,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  unique (user_id, provider)
);

create index if not exists connectors_user_idx on public.connectors (user_id);

alter table public.connectors enable row level security;

-- Every policy is owner-only. The service role bypasses RLS and is what
-- actually decrypts, always scoped by user_id in the calling code.
drop policy if exists "connectors_select_own" on public.connectors;
create policy "connectors_select_own" on public.connectors for select using (auth.uid() = user_id);

drop policy if exists "connectors_insert_own" on public.connectors;
create policy "connectors_insert_own" on public.connectors for insert with check (auth.uid() = user_id);

drop policy if exists "connectors_update_own" on public.connectors;
create policy "connectors_update_own" on public.connectors for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "connectors_delete_own" on public.connectors;
create policy "connectors_delete_own" on public.connectors for delete using (auth.uid() = user_id);

drop trigger if exists connectors_set_updated_at on public.connectors;
create trigger connectors_set_updated_at
  before update on public.connectors
  for each row execute function public.set_updated_at();

-- Which connector an approved ticket should be pushed to, and whether pushing
-- is on at all. One row per user.
create table if not exists public.user_settings (
  user_id            uuid primary key references auth.users (id) on delete cascade,
  ticket_provider    text check (ticket_provider in ('linear', 'jira')),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

alter table public.user_settings enable row level security;

drop policy if exists "user_settings_select_own" on public.user_settings;
create policy "user_settings_select_own" on public.user_settings for select using (auth.uid() = user_id);

drop policy if exists "user_settings_insert_own" on public.user_settings;
create policy "user_settings_insert_own" on public.user_settings for insert with check (auth.uid() = user_id);

drop policy if exists "user_settings_update_own" on public.user_settings;
create policy "user_settings_update_own" on public.user_settings for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop trigger if exists user_settings_set_updated_at on public.user_settings;
create trigger user_settings_set_updated_at
  before update on public.user_settings
  for each row execute function public.set_updated_at();
