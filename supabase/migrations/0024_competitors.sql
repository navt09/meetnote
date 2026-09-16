-- The competitors this account wants spotted in its calls.
--
-- A list the person keeps, not something a model infers: the transcript is
-- searched for exactly these names, so nothing can be reported that was not
-- said and was not asked about. Stored on the account so it follows the person
-- between machines, and read when a meeting is opened rather than baked into
-- the meeting, so a name added today is found in last month's calls too.
--
-- Bounded here as well as in the app (src/lib/signals.ts), so a request that
-- skips the route still cannot store an unbounded list.
--
-- Safe to run more than once.
alter table public.user_settings
  add column if not exists competitors text[] not null default '{}';

alter table public.user_settings
  drop constraint if exists user_settings_competitors_bounded;
alter table public.user_settings
  add constraint user_settings_competitors_bounded
    check (cardinality(competitors) <= 30);
