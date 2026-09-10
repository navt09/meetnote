-- Which of the two surfaces this person wants the app rendered on.
--
-- Stored on the account rather than in the browser so it follows someone
-- between machines, and so the server can stamp it on <html> before the first
-- paint. A browser-only setting would flash the other theme on every load.
--
-- Null means "not chosen", which the app renders as dark.
alter table user_settings
  add column if not exists theme text
    check (theme is null or theme in ('light', 'dark'));
