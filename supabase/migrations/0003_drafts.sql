-- Drafted follow-up work: a ticket written from a task, or an email written
-- from a person the meeting said to contact. Nothing leaves From the Call until a
-- person approves it.
-- Safe to run more than once.

create table if not exists public.drafts (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  meeting_id    uuid not null references public.meetings (id) on delete cascade,
  -- Set for a ticket drafted from a task; null for a standalone email.
  task_id       uuid references public.tasks (id) on delete cascade,

  kind          text not null check (kind in ('ticket', 'email')),
  subject       text not null,
  body          text not null,
  recipient     text,

  status        text not null default 'pending' check (status in ('pending', 'approved', 'dismissed')),
  approved_at   timestamptz,

  -- Where an approved draft was sent, once connectors exist. Null means it was
  -- only copied out by hand.
  destination   text,
  external_url  text,

  model         text,
  usage         jsonb,
  cost_usd      numeric not null default 0,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- One live draft per task, so pressing the button twice replaces rather than piles up.
create unique index if not exists drafts_one_per_task on public.drafts (task_id) where task_id is not null;
create index if not exists drafts_user_status_idx on public.drafts (user_id, status, created_at desc);
create index if not exists drafts_meeting_idx on public.drafts (meeting_id);

alter table public.drafts enable row level security;

drop policy if exists "drafts_select_own" on public.drafts;
create policy "drafts_select_own" on public.drafts for select using (auth.uid() = user_id);

drop policy if exists "drafts_insert_own" on public.drafts;
create policy "drafts_insert_own" on public.drafts for insert with check (auth.uid() = user_id);

drop policy if exists "drafts_update_own" on public.drafts;
create policy "drafts_update_own" on public.drafts for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "drafts_delete_own" on public.drafts;
create policy "drafts_delete_own" on public.drafts for delete using (auth.uid() = user_id);

drop trigger if exists drafts_set_updated_at on public.drafts;
create trigger drafts_set_updated_at
  before update on public.drafts
  for each row execute function public.set_updated_at();
