-- Where a draft is meant to go, chosen per draft rather than once in Settings.
--
-- Deliberately not the existing `destination` column, which records where an
-- approved draft actually went. Those are two different facts and a row needs
-- both: `send_to` is the intent, set when the draft is written and editable
-- until it is approved; `destination` is the receipt, written only after a
-- send succeeded. A row with send_to set and destination null was never
-- approved, which is a state you cannot express if one column means both.
--
-- Null means the row predates this column. Delivery falls back to the old
-- behaviour for those: the single provider chosen in Settings.
--
-- 'copy' is a real choice, not the absence of one. Plenty of follow-ups are
-- meant to be read and pasted somewhere this product does not reach, and a
-- person saying so is different from a person who never set anything up.
alter table public.drafts
  add column if not exists send_to text;

alter table public.drafts
  drop constraint if exists drafts_send_to_check;

alter table public.drafts
  add constraint drafts_send_to_check
  check (send_to is null or send_to in ('linear', 'jira', 'slack', 'gmail', 'copy'));
