-- A task can be blocked out on the calendar. Storing the link means the button
-- turns into "on your calendar" rather than silently creating a duplicate.
-- Safe to run more than once.

alter table public.tasks add column if not exists calendar_event_url text;
alter table public.tasks add column if not exists calendar_event_at timestamptz;
