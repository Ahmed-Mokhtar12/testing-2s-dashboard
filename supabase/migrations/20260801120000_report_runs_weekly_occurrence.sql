-- Weekly training progress emails: re-key report_runs by OCCURRENCE.
--
-- WHY. The reminder cadence changes from one send on day (lastDay-7) to one
-- every Friday at 08:00 Dubai. report_runs was keyed (report_type, period)
-- with period = 'YYYY-MM', so all four August Fridays would have shared the
-- key ('reminder','2026-08'): the first Friday sets status='sent', and
-- claimRun's `if (existing.status === 'sent') return null` then refuses every
-- later Friday as already-sent. The weekly cadence would have silently
-- degraded to monthly, with the cron reporting success the whole time.
--
-- The fix is a distinct key per scheduled send. `occurrence` is the DUE DATE,
-- uniformly for both report types:
--   monthly_summary period 2026-08 -> occurrence 2026-09-01
--   reminder        period 2026-08 -> occurrence 2026-08-07 / -14 / -21 / -28
-- `period` keeps its single meaning — the month the report's DATA covers,
-- which the email's month label is derived from.
--
-- APPLIED 2026-08-01 and verified against live constraint behaviour, not just
-- the catalogue. Four probe rows with period '2026-08' and occurrences
-- 08-07/-14/-21/-28 were all ACCEPTED (impossible before this migration); a
-- second monthly_summary for 2026-08 on a DIFFERENT occurrence was REFUSED by
-- report_runs_one_summary_per_period, proving the partial index and not merely
-- the primary key is doing that work; a status='skipped' row with no
-- skipped_reason was REFUSED, and the same row with a reason was accepted. All
-- probe rows were then deleted and the table re-verified empty — a leftover
-- ('monthly_summary','2026-09-01','sent') row would have suppressed the real
-- 1 September summary.
--
-- ROLLBACK: 20260801120000_report_runs_weekly_occurrence_rollback.sql.
-- Note it is lossy in one direction: collapsing back to (report_type, period)
-- cannot represent more than one reminder row per month, so it deletes all but
-- the newest reminder occurrence per period. That is stated in the file.

alter table public.report_runs add column occurrence date;

-- Backfill, so this is safe whether or not rows exist. report_runs is empty as
-- of writing (verified), and the only row that could appear before this ships
-- is a mode:'send' of July's summary — but a migration that assumes an empty
-- table is a migration that breaks the one time it matters.
--   monthly_summary: due the 1st of the month AFTER the period.
--   reminder (old cadence): due on day (lastDay - 7) of the period itself.
update public.report_runs
   set occurrence = (to_date(period || '-01', 'YYYY-MM-DD') + interval '1 month')::date
 where report_type = 'monthly_summary' and occurrence is null;

update public.report_runs
   set occurrence = (
         (date_trunc('month', to_date(period || '-01', 'YYYY-MM-DD'))
           + interval '1 month - 1 day')::date - 7
       )
 where report_type = 'reminder' and occurrence is null;

alter table public.report_runs alter column occurrence set not null;

-- (report_type, occurrence) is the tightest available statement of "one send":
-- one email per report type per due date. Deliberately NOT
-- (report_type, period, occurrence) — that wider key would allow two rows for
-- the same occurrence under different periods, so a period-computation bug
-- could produce a duplicate send instead of a constraint violation.
alter table public.report_runs drop constraint report_runs_pkey;
alter table public.report_runs add primary key (report_type, occurrence);

-- Preserve the old invariant EXPLICITLY rather than trusting the occurrence
-- computation to keep implying it: there can only ever be one monthly summary
-- per period, no matter what occurrence is derived for it. This survives a
-- future bug in the date logic; the primary key alone would not.
create unique index report_runs_one_summary_per_period
  on public.report_runs (report_type, period)
  where report_type = 'monthly_summary';

-- 'skipped' is a third real outcome, not a flavour of failure. Ruling: when
-- the 1st of the month falls on a Friday, ONE email goes out and it is the
-- monthly summary; that Friday's weekly is skipped. Recording it explicitly is
-- what stops a gap in the weekly series from looking like a missed send.
--
-- It needs its own status rather than reusing 'failed' + last_error because
-- excludeInFlightAndUnattempted() in index.ts filters status='failed' for the
-- outstanding-failure banner — a skip recorded as 'failed' would email the
-- managers a false alarm. As 'skipped' it is excluded automatically.
alter table public.report_runs drop constraint report_runs_status_check;
alter table public.report_runs
  add constraint report_runs_status_check
  check (status in ('sent', 'failed', 'skipped'));

alter table public.report_runs add column skipped_reason text null;

-- Self-enforcing: a skip without a stated reason is exactly the invisible gap
-- this whole mechanism exists to prevent, so the database refuses it.
alter table public.report_runs
  add constraint report_runs_skip_has_reason
  check (status <> 'skipped' or skipped_reason is not null);

comment on column public.report_runs.occurrence is
  'Due date of this specific scheduled send (YYYY-MM-DD Dubai). Part of the primary key: monthly_summary = 1st of the month after `period`; reminder = the Friday. Distinguishes the four-or-five weekly sends that share one `period`.';
comment on column public.report_runs.period is
  'The month the report DATA covers (YYYY-MM). Not unique for reminders — see `occurrence`.';
comment on column public.report_runs.skipped_reason is
  'Required when status = ''skipped''. Why this occurrence was recorded but deliberately not sent, so a gap in the weekly series always has a visible cause.';
