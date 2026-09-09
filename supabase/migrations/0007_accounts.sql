-- Account tiers.
--
--   owner  - you. Full access, plus the internal cost figures.
--   active - paying. Can record and use the AI features.
--   free   - signed up, can read what they already have, but cannot record
--            or spend money on transcription and drafting.
--
-- Deliberately NOT in user_settings: that table is user-writable under RLS, so
-- a person could promote themselves. This table gives users SELECT only. All
-- writes go through the service role.
-- Safe to run more than once.

create table if not exists public.accounts (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  tier       text not null default 'free' check (tier in ('free', 'active', 'owner')),
  -- Free-text note for why, e.g. "invited beta", "stripe sub_123".
  note       text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.accounts enable row level security;

-- Read your own tier. There is deliberately no insert, update or delete policy,
-- so nothing a signed-in user can send will change their own tier.
drop policy if exists "accounts_select_own" on public.accounts;
create policy "accounts_select_own" on public.accounts for select using (auth.uid() = user_id);

drop trigger if exists accounts_set_updated_at on public.accounts;
create trigger accounts_set_updated_at
  before update on public.accounts
  for each row execute function public.set_updated_at();

-- Everyone who already signed up keeps working: give existing accounts 'active'
-- rather than locking them out retroactively. New sign-ups default to 'free'.
insert into public.accounts (user_id, tier, note)
select id, 'active', 'existing account at tier rollout'
from auth.users
on conflict (user_id) do nothing;
