-- A task that was put on the person's Microsoft To Do list.
--
-- Mirrors calendar_event_url/at, and for the same reason: without a record the
-- button cannot tell "not added" from "added", and pressing it twice would
-- leave two copies on a list somebody actually works from.
--
-- Only the id is kept, not a link. Microsoft To Do has no per-task permalink,
-- so a stored URL would either point at the app's front door dressed up as a
-- deep link, or be invented. The id is what proves it was added, and the UI
-- says "on your To Do list" rather than pretending to link at it.
--
-- Safe to run more than once.
alter table public.tasks add column if not exists todo_task_id text;
alter table public.tasks add column if not exists todo_added_at timestamptz;
