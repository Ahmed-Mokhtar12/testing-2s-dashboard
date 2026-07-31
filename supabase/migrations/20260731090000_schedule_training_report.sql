-- APPLIED 2026-07-31 (jobid 3) via MCP apply_migration, after the owner
-- reviewed both mode:'test' emails and approved go-live. Recorded in
-- supabase_migrations.schema_migrations as version 20260731183744 name
-- 'schedule_training_report' — note that this project's recorded versions do
-- not match these filenames (every migration here was applied via MCP, which
-- stamps its own timestamp), so do NOT assume `supabase db push` would be a
-- no-op against this file.
--
-- Hourly heartbeat for training report emails. The function itself decides
-- what (if anything) is due — Dubai date logic, claim-guarded via
-- report_runs (report_runs' unique key stops duplicate ROWS; the atomic
-- claim in index.ts stops duplicate concurrent SENDS — see I2/claimRun),
-- retries across the due window. This is at-least-once, not exactly-once: a
-- Graph send whose response is lost before the ledger write commits will
-- retry and genuinely double-send.
--
-- Anon bearer, precisely: we follow the LIVE, working whatsapp-auto-release
-- pattern, not its committed migration. The deployed cron.job row for that
-- feature (jobname 'whatsapp-auto-release-every-minute') embeds a hardcoded
-- anon-key literal exactly like this migration does — that is the precedent
-- being followed. Its committed migration file
-- (20260515151557_schedule_whatsapp_auto_release.sql), by contrast, reads
-- `current_setting('app.settings.service_role_key', true)` — a service-role
-- GUC — which is a DIFFERENT, stronger-auth approach that was apparently
-- superseded live and never re-committed; that GUC is also not configured
-- on this project (verified: `current_setting(..., true)` returns null), so
-- copying the committed file literally would not even work. Anon bearer is
-- still safe here on its own merits, not just by precedent: the endpoint's
-- cron path sends only to the three fixed recipients, only within due
-- windows, and returns counts only — an attacker holding the anon key (a
-- public value) can at most trigger a due send a few minutes early.
select cron.schedule(
  'training-report-hourly',
  '0 * * * *',
  $$
  select net.http_post(
    url := 'https://yczcebfaqerlwfalrbjn.supabase.co/functions/v1/training-report',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InljemNlYmZhcWVybHdmYWxyYmpuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDU0ODE1MTcsImV4cCI6MjA2MTA1NzUxN30.fcVru8vxui_Jsuv1O8J7vh-Yn4dCcvPQ9UaOFZNjjQI'
    ),
    body := '{"mode":"cron"}'::jsonb
  ) as request_id;
  $$
);
