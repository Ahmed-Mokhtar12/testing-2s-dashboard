-- Rollback for 20260804110000_collapse_participant_whitespace.sql
--
-- WHAT ROLLING BACK COSTS
--
-- It restores the DEFECT. The pre-collapse values are the ones Sera's participant search
-- cannot match: `.includes(needle)` against a stored double space fails for any needle a
-- human would type, so the five affected colleagues become unfindable again in every
-- session already recorded — silently, with no error and no empty-result explanation.
--
-- It also RE-SPLITS the two stores. training_sessions.trainer_names holds collapsed
-- values (migration 20260803190000) and the app now writes collapsed participants, so
-- after this rollback the same person is once again stored two ways within one session —
-- which is the condition the whole B8 thread existed to remove.
--
-- WHY A SNAPSHOT EXISTS AT ALL. Collapsing is not invertible: "A B" carries no record of
-- having been "A  B", and the original strings exist nowhere else — the SharePoint source
-- rows were corrected by hand on 2026-08-04, so Colleagues_Master cannot supply them
-- either. Without the snapshot table this migration would be strictly one-way. That is
-- the reason it is here, and the reason it must not be dropped casually.
--
-- ROLLING BACK IS ONLY POSSIBLE WHILE THE SNAPSHOT SURVIVES. If
-- public.training_participants_ws_backfill_20260804 has been dropped, there is no route
-- back and this file cannot help. Verify before relying on it:
--
--   select count(*) from public.training_participants_ws_backfill_20260804;

begin;

do $$
begin
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public'
      and table_name = 'training_participants_ws_backfill_20260804'
  ) then
    raise exception
      'ROLLBACK IMPOSSIBLE: the snapshot table is gone. The pre-collapse values existed '
      'only there — Colleagues_Master was corrected by hand the same day, so nothing else '
      'holds them. Rolling back would require re-entering them from a database backup.';
  end if;
end $$;

update public.training_participants p
set colleague_name = b.colleague_name,
    position       = b.position,
    section        = b.section,
    department     = b.department
from public.training_participants_ws_backfill_20260804 b
where p.id = b.id;

-- Verify the restore matched every snapshotted row before committing. A snapshot row
-- whose participant has since been deleted would silently restore nothing.
do $$
declare
  snapshot_rows int;
  matched int;
begin
  select count(*) into snapshot_rows from public.training_participants_ws_backfill_20260804;
  select count(*) into matched
  from public.training_participants p
  join public.training_participants_ws_backfill_20260804 b on b.id = p.id
  where p.colleague_name = b.colleague_name
    and p.position = b.position
    and p.section = b.section
    and p.department = b.department;

  if matched <> snapshot_rows then
    raise exception
      'ROLLBACK INCOMPLETE: % of % snapshotted row(s) restored. The unmatched ones no '
      'longer exist in training_participants.', matched, snapshot_rows;
  end if;

  raise notice 'Restored % pre-collapse participant row(s).', snapshot_rows;
end $$;

commit;

-- DELIBERATELY NOT DROPPED HERE. Dropping the snapshot in the rollback would make the
-- rollback itself irreversible, so re-applying the migration afterwards would have no
-- record to fall back to. Drop it as a separate, considered act once neither direction
-- is wanted:
--
--   drop table public.training_participants_ws_backfill_20260804;
