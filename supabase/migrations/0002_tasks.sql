-- Action items become real rows so they can be ticked off, filtered across
-- meetings, and later pushed to Jira or Linear.
-- Safe to run more than once.

create table if not exists public.tasks (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  meeting_id   uuid not null references public.meetings (id) on delete cascade,
  -- Position within that meeting's action_items, so re-running extraction
  -- updates the same task instead of duplicating it.
  idx          int not null,
  title        text not null,
  details      text not null default '',
  owner        text,
  due          text,
  priority     text not null default 'medium' check (priority in ('low','medium','high')),
  kind         text not null default 'task'   check (kind in ('bug','feature','task','follow_up','other')),
  status       text not null default 'open'   check (status in ('open','done','dismissed')),
  completed_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (meeting_id, idx)
);

create index if not exists tasks_user_status_idx on public.tasks (user_id, status, created_at desc);
create index if not exists tasks_meeting_idx on public.tasks (meeting_id);

alter table public.tasks enable row level security;

drop policy if exists "tasks_select_own" on public.tasks;
create policy "tasks_select_own" on public.tasks for select using (auth.uid() = user_id);

drop policy if exists "tasks_insert_own" on public.tasks;
create policy "tasks_insert_own" on public.tasks for insert with check (auth.uid() = user_id);

drop policy if exists "tasks_update_own" on public.tasks;
create policy "tasks_update_own" on public.tasks for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "tasks_delete_own" on public.tasks;
create policy "tasks_delete_own" on public.tasks for delete using (auth.uid() = user_id);

drop trigger if exists tasks_set_updated_at on public.tasks;
create trigger tasks_set_updated_at
  before update on public.tasks
  for each row execute function public.set_updated_at();

-- Backfill from meetings that already have notes. Existing rows are left alone,
-- so a person's "done" ticks survive.
insert into public.tasks (user_id, meeting_id, idx, title, details, owner, due, priority, kind)
select
  m.user_id,
  m.id,
  (a.ord - 1)::int,
  coalesce(nullif(a.item ->> 'title', ''), 'Untitled task'),
  coalesce(a.item ->> 'details', ''),
  nullif(a.item ->> 'owner', ''),
  nullif(a.item ->> 'due', ''),
  case when a.item ->> 'priority' in ('low','medium','high') then a.item ->> 'priority' else 'medium' end,
  case when a.item ->> 'kind' in ('bug','feature','task','follow_up','other') then a.item ->> 'kind' else 'task' end
from public.meetings m
cross join lateral jsonb_array_elements(coalesce(m.notes -> 'action_items', '[]'::jsonb)) with ordinality as a(item, ord)
on conflict (meeting_id, idx) do nothing;
