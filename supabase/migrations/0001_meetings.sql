-- From the Call: meetings table with per-user row security.
-- Safe to run more than once.

create extension if not exists "pgcrypto";

create table if not exists public.meetings (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references auth.users (id) on delete cascade,
  title                 text not null default 'Untitled meeting',
  status                text not null default 'recorded'
                        check (status in ('recorded','uploaded','transcribing','transcribed','extracting','done','error')),
  error                 text,
  storage_path          text,
  mime_type             text,
  bytes                 bigint,
  duration_seconds      numeric,
  recorded_at           timestamptz not null default now(),
  transcript            jsonb,
  notes                 jsonb,
  usage                 jsonb,
  transcription_cost_usd numeric not null default 0,
  llm_cost_usd          numeric not null default 0,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists meetings_user_recorded_idx on public.meetings (user_id, recorded_at desc);

alter table public.meetings enable row level security;

-- Users only ever see and touch their own rows. The service role bypasses RLS
-- and is used only by the server-side pipeline after ownership is verified.
drop policy if exists "meetings_select_own" on public.meetings;
create policy "meetings_select_own" on public.meetings
  for select using (auth.uid() = user_id);

drop policy if exists "meetings_insert_own" on public.meetings;
create policy "meetings_insert_own" on public.meetings
  for insert with check (auth.uid() = user_id);

drop policy if exists "meetings_update_own" on public.meetings;
create policy "meetings_update_own" on public.meetings
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "meetings_delete_own" on public.meetings;
create policy "meetings_delete_own" on public.meetings
  for delete using (auth.uid() = user_id);

-- Keep updated_at honest without relying on application code.
create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists meetings_set_updated_at on public.meetings;
create trigger meetings_set_updated_at
  before update on public.meetings
  for each row execute function public.set_updated_at();

-- Storage: recordings live under <user_id>/... in the private "recordings"
-- bucket. Browsers never talk to storage directly except through signed URLs
-- our server mints after checking ownership, so no storage policies are needed
-- for the anon role. (Bucket is created by the app on first use.)
