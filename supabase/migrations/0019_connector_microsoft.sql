-- Microsoft as a connectable provider.
--
-- One row, not five. Outlook, Teams, Planner, SharePoint and Excel are all
-- Microsoft Graph behind a single Entra app registration and a single consent,
-- so the connector is `microsoft` and the granted scopes in `config` decide
-- what it may actually touch. Five rows would mean five sign-ins for one
-- account, which is the thing people complain about with Microsoft
-- integrations rather than a feature.
--
-- Safe to run more than once.
alter table public.connectors
  drop constraint if exists connectors_provider_check;

alter table public.connectors
  add constraint connectors_provider_check
  check (provider in ('linear', 'jira', 'slack', 'google', 'microsoft', 'llm'));
