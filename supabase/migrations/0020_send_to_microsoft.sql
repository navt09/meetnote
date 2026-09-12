-- Outlook and Microsoft To Do as places a follow-up can go.
--
-- 'outlook' is a mailbox, alongside 'gmail': an email draft has exactly one
-- kind of destination, the sender's own mail, and which one is a matter of
-- the account rather than of anything the meeting said.
--
-- 'todo' is Microsoft To Do, deliberately not Planner. A Planner board belongs
-- to a Microsoft 365 group and so needs a work tenant, while To Do exists on
-- every Microsoft account including personal ones. One Graph permission
-- (Tasks.ReadWrite) covers both, so the scope cannot tell them apart and the
-- choice had to be made here.
--
-- Safe to run more than once.
alter table public.drafts
  drop constraint if exists drafts_send_to_check;

alter table public.drafts
  add constraint drafts_send_to_check
  check (send_to is null or send_to in ('linear', 'jira', 'slack', 'gmail', 'outlook', 'todo', 'copy'));
