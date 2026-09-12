-- Teams as a place a follow-up can go.
--
-- Beside Slack rather than beside Linear: a channel message has no owner and
-- no state, so it is a nudge to a group rather than a tracked issue, and the
-- wording on the approval card says so before anybody presses the button.
--
-- Work and school accounts only. A personal Microsoft account has the Teams
-- app but no teams and no channels, so there is nothing for this to address.
--
-- Safe to run more than once.
alter table public.drafts
  drop constraint if exists drafts_send_to_check;

alter table public.drafts
  add constraint drafts_send_to_check
  check (send_to is null or send_to in ('linear', 'jira', 'slack', 'gmail', 'outlook', 'todo', 'teams', 'copy'));
