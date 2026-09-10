-- One live email draft per person per meeting, the same rule tickets already
-- have per task.
--
-- Drafting an email used to be reachable only from a meeting's own notes. It
-- is now offered on the Tasks page too, so the same person can be drafted from
-- two places, and a refresh loses the browser's memory of having done it. That
-- is a queue quietly filling with three copies of the same email.
--
-- A plain unique index rather than a partial one, for the reason 0004 gives
-- for tasks: PostgREST cannot use a partial index as an upsert conflict
-- target. Postgres treats NULLs as distinct, so ticket rows, which have no
-- recipient, are unaffected and any number of them can share a meeting.
--
-- Existing duplicates would block the index, so the oldest copy of each pair
-- is cleared out first. The newest is the one worth keeping: it was drafted
-- from whatever the notes say now.
delete from public.drafts d
where d.recipient is not null
  and exists (
    select 1
    from public.drafts newer
    where newer.meeting_id = d.meeting_id
      and newer.recipient = d.recipient
      and (newer.created_at, newer.id) > (d.created_at, d.id)
  );

create unique index if not exists drafts_one_per_recipient
  on public.drafts (meeting_id, recipient);
