-- Why a task exists, and where to start on it, kept beside the task itself.
--
-- Both come out of the extraction call that already reads the whole transcript,
-- so neither column costs a request. Quote is the words that produced the task,
-- verbatim, which is how somebody checks it was not invented. First step is a
-- suggestion drawn from the discussion, and is labelled as a suggestion
-- everywhere it is shown.
--
-- Nullable on purpose, and with no default: a task extracted before this
-- migration simply has neither, and the model is allowed to answer "nothing"
-- for either on a meeting that gave it nothing to go on. The UI treats absent
-- and null the same way.
alter table public.tasks
  add column if not exists quote text,
  add column if not exists first_step text;
