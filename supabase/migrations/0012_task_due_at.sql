-- The deadline as an actual moment, resolved once when the task is created.
--
-- `due` holds what was said in the meeting ("Thursday", "before the demo").
-- Reading that phrase again later gives the wrong answer: a task agreed three
-- weeks ago and due "Thursday" resolves to *next* Thursday every time the page
-- is opened, so it can never be late and it silently walks forward for ever.
--
-- This column pins it against the clock at extraction time. Null means nothing
-- concrete was said, which stays a deadline nobody has to invent.
alter table public.tasks
  add column if not exists due_at timestamptz;

-- The deadline list reads open tasks in date order, per person.
create index if not exists tasks_due_idx
  on public.tasks (user_id, due_at)
  where due_at is not null;
