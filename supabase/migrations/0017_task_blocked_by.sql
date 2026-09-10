-- What has to happen before a task can be started.
--
-- The one thing a task can carry that changes what a person does with it
-- rather than describing it: work waiting on somebody else belongs on a chase
-- list, not on today's list. Meetings say this out loud constantly ("once
-- Priya lands the schema change", "waiting on the icons from design") and the
-- notes threw it away.
--
-- Comes out of the same extraction call that already reads the transcript, so
-- like quote and first_step it costs no request.
--
-- It records what the meeting said, at that moment, in the meeting's own
-- words, and is never updated afterwards. It will not notice that the thing
-- being waited on has since landed. That is deliberate: live dependency state
-- is a project tracker, which is a much larger product than this one, and a
-- stale one would be worse than none.
--
-- Nullable, and null is the common answer.
alter table public.tasks
  add column if not exists blocked_by text;
