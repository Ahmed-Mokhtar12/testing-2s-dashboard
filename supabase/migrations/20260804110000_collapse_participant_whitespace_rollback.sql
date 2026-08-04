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
-- having been "A  B", and at the time the migration ran the original strings existed
-- nowhere else — the SharePoint source rows were corrected by hand on 2026-08-04, so
-- Colleagues_Master could not supply them either. Without the snapshot table the migration
-- would have been strictly one-way. (Since 2026-08-04 the single affected row is also
-- recorded in the block further down, which is what makes the table safe to drop.)
--
-- ROLLING BACK IS ONLY POSSIBLE WHILE THE SNAPSHOT SURVIVES. If
-- public.training_participants_ws_backfill_20260804 has been dropped, there is no route
-- back and this file cannot help. Verify before relying on it:
--
--   select count(*) from public.training_participants_ws_backfill_20260804;
--
-- ---------------------------------------------------------------------------
-- APPLIED 2026-08-04. It collapsed ONE row: TRN-20260803113419, employee_id 102188,
-- "Abdelfattah Abdelwahed  Ghallab" (double space) -> "Abdelfattah Abdelwahed Ghallab".
-- So the snapshot table holds exactly one row, and this whole file exists for it.
--
-- RECORDED PRE-COLLAPSE VALUES — transcribed from the snapshot table 2026-08-04, one row,
-- verbatim. With these here, the snapshot table is redundant and dropping it costs
-- nothing: the statement below replaces the table-driven UPDATE further down.
--
--   id             88b0975a-7af4-47ed-aceb-af9068b96a0e
--   colleague_name Abdelfattah Abdelwahed  Ghallab   <- TWO spaces: Abdelwahed··Ghallab
--   position       Assistant Reservations Manager
--   section        Reservation
--   department     Revenue
--
-- Only the name was dirty. The other three are recorded anyway because the restore writes
-- all four columns, and a restore that guesses three of them is not a restore.
--
-- THIS RECORD IS A DOUBLE SPACE, AND A DOUBLE SPACE IS PRECISELY WHAT AN EDITOR, A
-- FORMATTER, A MARKDOWN RENDERER OR A PASTE THROUGH A BROWSER COLLAPSES WITHOUT ASKING.
-- The value would then look right and restore the collapsed form — a silent no-op dressed
-- as a rollback. So the statement carries its own integrity check: the literal must be 31
-- characters with the doubled space at offset 23. If that check raises, this comment block
-- has been mangled since it was written; do NOT trust the literal, recover from a database
-- backup instead.
--
--   do $$
--   declare
--     original text := 'Abdelfattah Abdelwahed  Ghallab';
--   begin
--     if length(original) <> 31 or position('  ' in original) <> 23 then
--       raise exception
--         'RECORDED LITERAL MANGLED: length % (expected 31), double space at % (expected 23)',
--         length(original), position('  ' in original);
--     end if;
--
--     update public.training_participants
--     set colleague_name = original,
--         position       = 'Assistant Reservations Manager',
--         section        = 'Reservation',
--         department     = 'Revenue'
--     where id = '88b0975a-7af4-47ed-aceb-af9068b96a0e';
--   end $$;
--
-- SUPERSEDES one claim made twice above and once in the migration itself: that the
-- pre-collapse strings "exist nowhere else". That was true while the snapshot table was
-- the only copy, and it is why the table was created; it stopped being true when this
-- block was committed. The migration file is deliberately left byte-identical to what was
-- applied, so its comment still says the older thing — this is the correction.
--
-- See docs/backlog.md B10.
-- ---------------------------------------------------------------------------

begin;

do $$
begin
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public'
      and table_name = 'training_participants_ws_backfill_20260804'
  ) then
    raise exception
      'SNAPSHOT TABLE GONE — expected, if it was dropped after 2026-08-04. This path needs '
      'it, but the rollback is still possible: the one row it held is recorded verbatim in '
      'the header of this file, with a length-checked UPDATE. Run that instead of this '
      'file. Do NOT conclude the values are lost without reading the header first.';
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
