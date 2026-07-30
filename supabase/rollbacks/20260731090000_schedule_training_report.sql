-- ROLLBACK for 20260731090000_schedule_training_report.sql. Apply via
-- MCP/psql; NOT a migration (this directory is not scanned by the CLI, so
-- it never replays on db reset).
select cron.unschedule('training-report-hourly');
