-- Rollback for 20260901100200_schedule_rls_sentinel.sql
-- COST OF ROLLING BACK: the next platform-only migration that creates a table with RLS off
-- goes unnoticed again until someone reads the advisors.
select cron.unschedule('rls-sentinel-daily');
