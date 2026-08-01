-- ROLLBACK for 20260801120000_report_runs_weekly_occurrence.sql.
--
-- NOT APPLIED AUTOMATICALLY. Run this only if the weekly cadence is reverted in
-- code as well — the edge function keys every report_runs read and write on
-- (report_type, occurrence), so rolling back the schema alone would break every
-- send.
--
-- LOSSY, DELIBERATELY AND IN ONE DIRECTION. The point of `occurrence` is that a
-- month holds four or five reminder rows; the old (report_type, period) key
-- cannot represent more than one. So this keeps the NEWEST reminder occurrence
-- per period and DELETES the rest. Read the count it reports before committing:
-- those rows are the record of which Fridays actually went out.
--
-- 'skipped' rows are converted to 'failed' with the reason moved into
-- last_error, because the old status CHECK has no third value. That means a
-- deliberate skip comes back as an apparent failure and will show up in the
-- outstanding-failure banner — an accepted cost of going backwards, not an
-- oversight.

begin;

-- See what is about to be destroyed.
select report_type, period, count(*) as occurrences
  from public.report_runs
 group by report_type, period
having count(*) > 1
 order by period;

delete from public.report_runs r
 where exists (
   select 1 from public.report_runs newer
    where newer.report_type = r.report_type
      and newer.period = r.period
      and newer.occurrence > r.occurrence
 );

update public.report_runs
   set status = 'failed',
       last_error = coalesce(last_error, '') || case
         when skipped_reason is null then ''
         else 'skipped: ' || skipped_reason end
 where status = 'skipped';

drop index if exists public.report_runs_one_summary_per_period;

alter table public.report_runs drop constraint report_runs_skip_has_reason;
alter table public.report_runs drop column skipped_reason;

alter table public.report_runs drop constraint report_runs_status_check;
alter table public.report_runs
  add constraint report_runs_status_check
  check (status in ('sent', 'failed'));

alter table public.report_runs drop constraint report_runs_pkey;
alter table public.report_runs add primary key (report_type, period);

alter table public.report_runs drop column occurrence;

-- Check the row count and the status spread before you commit.
select status, count(*) from public.report_runs group by status;

commit;
