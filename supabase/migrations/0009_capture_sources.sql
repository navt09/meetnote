-- Which audio sources the browser actually captured for a recording:
-- {"system": bool, "mic": bool}.
--
-- Diagnostic, not product data. Without it, a recording that came out wrong is
-- impossible to explain after the fact: "only 9 of 45 seconds were scored as
-- the user" reads completely differently depending on whether the meeting
-- audio track was ever handed to us. The browser knows at capture time and
-- warns about it, but the answer was not being kept.
--
-- Internal: never returned to the browser, same as self_speech.
--
-- Safe to run more than once.

alter table public.meetings add column if not exists sources jsonb;
