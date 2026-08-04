-- Collapse whitespace in the four text columns of training_participants.
--
-- WHY. One submission used to store the same person two ways: trainer names went through
-- toTrainerNames (collapse + trim) while the participant row was written raw. So
-- employeeId 101710 is "Muhammed Muhammed Zawahir" in training_sessions.trainer_names
-- and "Muhammed Muhammed  Zawahir" in training_participants.colleague_name.
--
-- That is not cosmetic. Sera matches participants with
--   (p.colleague_name ?? '').toLowerCase().includes(needle)
-- (chat-with-data/training-aggregator.ts), so a needle typed the way a human types it —
-- one space — cannot match a stored double space. Affected colleagues are unfindable in a
-- search of sessions already recorded, silently, with no error and no empty-result
-- explanation. See docs/backlog.md B8 and docs/testing-lessons.md §13.
--
-- The two write paths are already fixed (38c41ed closed sp-manage-colleague, the entry
-- point; 5fe8b20 added the participant-write backstop) and Colleagues_Master itself was
-- cleaned by hand on 2026-08-04. This migration is the third and last part: the rows
-- already written.
--
-- ALL FOUR TEXT COLUMNS, not just the name. Two of the six dirty Colleagues_Master rows
-- were POSITIONS (" IT Manager", "Executive Secretary  /PA") and position/section/
-- department travel into this table exactly as the name does.
--
-- ---------------------------------------------------------------------------
-- RUN THIS PROBE FIRST, ONCE, BEFORE APPLYING THIS FILE
-- ---------------------------------------------------------------------------
-- Everything below depends on the whole file being ONE transaction: on any assertion
-- failure the snapshot table must vanish along with the data change. Postgres DDL is
-- transactional, so that holds — but only if the migration runner does not split the
-- file and auto-commit each statement. That is a property of the runner, not of this SQL,
-- and it is worth proving rather than assuming:
--
--   begin;
--   create table public.atomicity_probe_20260804 (x int);
--   do $$ begin raise exception 'deliberate probe failure'; end $$;
--   commit;
--
--   select count(*) as leftover from information_schema.tables
--   where table_schema = 'public' and table_name = 'atomicity_probe_20260804';
--
-- leftover = 0  -> DDL rolls back with the transaction. This migration aborts cleanly:
--                  no table, no data change, nothing to undo. Proceed.
-- leftover = 1  -> the runner auto-commits statements. DO NOT APPLY THIS FILE as-is;
--                  `drop table public.atomicity_probe_20260804;` and see the recovery
--                  note at the foot of this file.

begin;

-- ---------------------------------------------------------------------------
-- The collapse rule, as a pattern rather than repeated inline.
--
-- '[[:space:]]' plus chr(160): Postgres's [[:space:]] does NOT include U+00A0
-- (non-breaking space) whereas JavaScript's \s DOES, so a pattern of [[:space:]] alone
-- would be NARROWER than the rule the app applies — it would leave a value that the app
-- then rewrites differently, which is the exact divergence this migration exists to
-- remove. The assertion at the end fails the migration if any value still differs from
-- its collapsed form under this same broader pattern.
-- ---------------------------------------------------------------------------
create temporary table ws_rule (pattern text) on commit drop;
insert into ws_rule values ('([[:space:]]|' || chr(160) || ')+');

create temporary table ws_before as
select count(*) as rows_total from public.training_participants;

-- ---------------------------------------------------------------------------
-- Snapshot, for the rollback. Collapsing is NOT invertible — "A B" carries no record of
-- having been "A  B" — and the original dirty strings now exist nowhere else: the
-- SharePoint source rows were corrected by hand the same day. So the only way this is
-- reversible at all is to keep the prior values.
--
-- CREATE TABLE + explicit lockdown, NEVER `create table as`. Per CLAUDE.md: an ad-hoc
-- snapshot table starts world-readable AND WORLD-WRITABLE through the published anon key,
-- because the anon role holds Supabase's default blanket grants. This one holds colleague
-- names, positions and employee ids, so that is a real exposure and not a theoretical
-- one — reviews_backup_20260731 sat world-readable until it was caught.
-- ---------------------------------------------------------------------------
create table public.training_participants_ws_backfill_20260804 (
  id uuid primary key,
  colleague_name text not null,
  position text not null,
  section text not null,
  department text not null
);

alter table public.training_participants_ws_backfill_20260804 enable row level security;
alter table public.training_participants_ws_backfill_20260804 force row level security;
revoke all on public.training_participants_ws_backfill_20260804 from anon, authenticated;

comment on table public.training_participants_ws_backfill_20260804 is
  'Pre-collapse values for migration 20260804110000. Restore source for its rollback. '
  'No RLS policy and no grants: service_role only, deliberately. Drop once the rollback '
  'window has passed.';

-- ---------------------------------------------------------------------------
-- PRIVILEGE CHECK FIRST, BEFORE ANY DATA MOVES.
--
-- Moved ahead of the snapshot and the UPDATE deliberately. It depends only on the grants
-- just applied, not on any row, so there is no reason for it to run last — and running it
-- last is strictly worse: if it fired there, a runner that auto-committed statements would
-- have left a populated snapshot AND a completed collapse behind. Here, the worst case
-- under a non-transactional runner is an empty table to drop and no data touched.
--
-- Checked as a PRIVILEGE, not as a setting: relrowsecurity = true says RLS is enabled,
-- while has_table_privilege says whether the published anon key can actually reach the
-- rows. Those are different questions and only the second one is the exposure.
-- ---------------------------------------------------------------------------
do $$
declare
  priv text;
begin
  foreach priv in array array['select', 'insert', 'update', 'delete'] loop
    if has_table_privilege('anon', 'public.training_participants_ws_backfill_20260804', priv) then
      raise exception 'MIGRATION ABORTED before touching data: anon holds % on the snapshot table', priv;
    end if;
    if has_table_privilege('authenticated', 'public.training_participants_ws_backfill_20260804', priv) then
      raise exception 'MIGRATION ABORTED before touching data: authenticated holds % on the snapshot table', priv;
    end if;
  end loop;
  raise notice 'Snapshot table locked down: anon and authenticated hold no select/insert/update/delete.';
end $$;

insert into public.training_participants_ws_backfill_20260804
select p.id, p.colleague_name, p.position, p.section, p.department
from public.training_participants p, ws_rule r
where p.colleague_name <> btrim(regexp_replace(p.colleague_name, r.pattern, ' ', 'g'))
   or p.position       <> btrim(regexp_replace(p.position,       r.pattern, ' ', 'g'))
   or p.section        <> btrim(regexp_replace(p.section,        r.pattern, ' ', 'g'))
   or p.department     <> btrim(regexp_replace(p.department,     r.pattern, ' ', 'g'));

update public.training_participants p
set colleague_name = btrim(regexp_replace(p.colleague_name, r.pattern, ' ', 'g')),
    position       = btrim(regexp_replace(p.position,       r.pattern, ' ', 'g')),
    section        = btrim(regexp_replace(p.section,        r.pattern, ' ', 'g')),
    department     = btrim(regexp_replace(p.department,     r.pattern, ' ', 'g'))
from ws_rule r
where p.id in (select id from public.training_participants_ws_backfill_20260804);

-- ---------------------------------------------------------------------------
-- Verify by BEHAVIOUR, in the same transaction, and roll the whole thing back on any
-- failure. Same discipline as 20260803190000: a migration that reports success without
-- checking what it did is how the report shipped an inflated trainer count twice.
-- ---------------------------------------------------------------------------
do $$
declare
  pattern text := (select pattern from ws_rule);
  still_dirty int;
  snapshot_rows int;
  rows_now int;
  rows_was int;
begin
  execute format($q$
    select count(*) from public.training_participants p
    where p.colleague_name <> btrim(regexp_replace(p.colleague_name, %L, ' ', 'g'))
       or p.position       <> btrim(regexp_replace(p.position,       %L, ' ', 'g'))
       or p.section        <> btrim(regexp_replace(p.section,        %L, ' ', 'g'))
       or p.department     <> btrim(regexp_replace(p.department,     %L, ' ', 'g'))
  $q$, pattern, pattern, pattern, pattern) into still_dirty;

  if still_dirty <> 0 then
    raise exception 'MIGRATION FAILED: % participant row(s) still differ from their collapsed form', still_dirty;
  end if;

  select count(*) into snapshot_rows from public.training_participants_ws_backfill_20260804;
  select count(*) into rows_now from public.training_participants;
  select rows_total into rows_was from ws_before;

  -- Nothing may be created or destroyed. An UPDATE cannot change the count, so this is
  -- cheap insurance against a future edit turning it into a delete-and-reinsert.
  if rows_now <> rows_was then
    raise exception 'MIGRATION FAILED: participant count changed from % to %', rows_was, rows_now;
  end if;

  -- The snapshot is the ONLY route back. An empty one means either nothing was dirty
  -- (fine, and worth saying out loud) or the WHERE clause and the UPDATE disagree.
  if snapshot_rows = 0 then
    raise notice 'RESULT: nothing was dirty. 0 of % participant row(s) changed, snapshot empty, the rollback is a no-op.', rows_now;
  else
    raise notice 'RESULT: collapsed % of % participant row(s); % snapshotted for rollback.', snapshot_rows, rows_now, snapshot_rows;
  end if;
end $$;

commit;

-- ---------------------------------------------------------------------------
-- RECOVERY, only needed if the probe at the top showed a non-transactional runner AND
-- this file was applied anyway. Work backwards:
--
--   -- 1. undo the data change, if it happened
--   update public.training_participants p
--   set colleague_name = b.colleague_name, position = b.position,
--       section = b.section, department = b.department
--   from public.training_participants_ws_backfill_20260804 b where p.id = b.id;
--
--   -- 2. remove the table
--   drop table public.training_participants_ws_backfill_20260804;
--
-- Step 1 is safe to run even if the UPDATE never executed: it would set every column to
-- the value it already holds.
-- ---------------------------------------------------------------------------
