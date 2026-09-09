-- Search across a person's own meetings.
--
-- Done in the database rather than the application because the haystack is the
-- transcript: pulling every transcript into Node to filter them would move
-- megabytes to search kilobytes.
--
-- security invoker is the load-bearing word. The function runs as the caller,
-- so row level security on meetings still applies and one account can never
-- search another's recordings.
--
-- Safe to run more than once.

create or replace function public.search_meetings(q text)
returns table (
  id uuid,
  title text,
  status text,
  recorded_at timestamptz,
  duration_seconds numeric,
  summary text,
  snippet text,
  matched_in text
)
language sql
stable
security invoker
set search_path = public
as $$
  with needle as (select '%' || trim(q) || '%' as pat, trim(q) as raw),
  hit as (
    select
      m.id, m.title, m.status, m.recorded_at, m.duration_seconds,
      m.notes ->> 'summary' as summary,
      -- Where it matched, most useful first: what you named it, then what it
      -- was about, then what was actually said.
      case
        when m.title ilike n.pat then 'title'
        when coalesce(m.notes ->> 'summary', '') ilike n.pat then 'summary'
        when coalesce(m.notes::text, '') ilike n.pat then 'notes'
        else 'transcript'
      end as matched_in,
      case
        when m.title ilike n.pat then null
        when coalesce(m.notes ->> 'summary', '') ilike n.pat then m.notes ->> 'summary'
        when coalesce(m.notes::text, '') ilike n.pat then m.notes::text
        else coalesce(m.transcript::text, '')
      end as haystack,
      n.raw
    from public.meetings m, needle n
    where trim(q) <> ''
      and (
        m.title ilike n.pat
        or coalesce(m.notes::text, '') ilike n.pat
        or coalesce(m.transcript::text, '') ilike n.pat
      )
  )
  select
    hit.id, hit.title, hit.status, hit.recorded_at, hit.duration_seconds, hit.summary,
    case
      when hit.haystack is null then null
      -- A window around the match, so the result shows why it matched.
      else substring(hit.haystack from greatest(1, position(lower(hit.raw) in lower(hit.haystack)) - 70) for 200)
    end as snippet,
    hit.matched_in
  from hit
  order by hit.recorded_at desc
  limit 50;
$$;

-- Trigram indexes so ILIKE does not become a sequential scan over every
-- transcript once an account has a few hundred meetings.
create extension if not exists pg_trgm;
create index if not exists meetings_title_trgm on public.meetings using gin (title gin_trgm_ops);
