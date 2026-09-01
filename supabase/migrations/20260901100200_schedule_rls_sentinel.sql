-- 20260901100200_schedule_rls_sentinel.sql
--
-- public.enforce_rls_on_public_tables() (live migration rls_sentinel_guard, 2026-08-20) turns
-- RLS on for any public table that has it off and is owned by postgres, logs to
-- rls_sentinel_log and pushes an ntfy alert. It existed but was never scheduled, which is
-- how three RLS-off tables lived unnoticed for a week (audit L3).
--
-- SAFE FOR n8n: the only non-dashboard writer connects as postgres (BYPASSRLS), and the
-- function never FORCEs RLS, never touches grants, never runs on tables it does not own.
-- A table that must stay RLS-off is opted out by inserting its name into
-- public.rls_sentinel_allowlist. Scheduled by postgres (this migration runs as postgres),
-- unlike the broken auto-release job that was scheduled as supabase_read_only_user.
--
-- Debated with the Codex plan review, which preferred an alert-only variant; kept as
-- enforcement because the function is the owner's own design, acts only on the exact hole
-- being closed, and already alerts on every action (see the plan's Task 7 for the record).
select cron.schedule(
  'rls-sentinel-daily',
  '30 3 * * *',
  $$ select public.enforce_rls_on_public_tables(); $$
);

do $$
begin
  if not exists (select 1 from cron.job where jobname = 'rls-sentinel-daily' and username = 'postgres' and active) then
    raise exception 'rls-sentinel-daily was not scheduled as postgres';
  end if;
end $$;
