-- Who was talking, and what to call them.
--
-- self_speech: [start, end] windows in seconds when the person recording was
-- the one speaking, measured in the browser from the microphone against the
-- meeting audio. Written once at meeting creation; read by the pipeline to
-- stamp the transcript. Never returned to the browser: it is a by-product of
-- the recording, not something to display.
--
-- display_name: the name the notes should use for that person, as people say
-- it in meetings. Optional; "You" is used when it is empty.
--
-- Safe to run more than once.

alter table public.meetings add column if not exists self_speech jsonb;

alter table public.user_settings add column if not exists display_name text;
