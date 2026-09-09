-- The partial unique index on drafts.task_id could not be used as an upsert
-- target: ON CONFLICT can only infer a partial index if the statement repeats
-- its WHERE clause, which the client can't express.
--
-- A plain unique index does the same job here. Postgres treats NULLs as
-- distinct by default, so email drafts (task_id null) can still be many, while
-- a task can still only have one live ticket draft.

drop index if exists public.drafts_one_per_task;
create unique index if not exists drafts_one_per_task on public.drafts (task_id);
