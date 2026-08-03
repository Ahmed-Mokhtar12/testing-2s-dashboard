-- ROLLBACK for 20260803190000_normalise_trainer_names.sql.
--
-- NOT APPLIED AUTOMATICALLY — this file exists so the undo is one paste rather than
-- one recollection.
--
-- WHAT IT COSTS. It restores the pre-migration trainer_names arrays exactly, so the
-- monthly report goes back to reporting 6 distinct trainers where there are 5 people,
-- and — once the trainer field writes ColleagueName — every report spanning the
-- cutover counts five people twice each. Nothing else in the system reads these
-- values, so there is no other consequence.
--
-- WHY IT IS WRITTEN PER training_id AND NOT AS REVERSE array_replace CALLS. A blind
-- reverse (array_replace(..., 'Ahmed Mokhtar Elsayed Elaktaa', 'Ahmed Mokhtar')) would
-- also rewrite TRN-20260803153004, which already held the long form BEFORE the
-- migration and was deliberately left untouched. That would corrupt a row the forward
-- migration never changed. Restoring literal arrays for the four sessions that were
-- actually modified is the only reverse that is faithful.
--
-- The five untouched-by-rollback facts, for reference: sharepoint_id 20 and 21 are
-- rows whose SharePoint items no longer exist, and TRN-20260803153004 (sharepoint_id
-- 25) was already canonical.

update public.training_sessions set trainer_names = array['Ahmed Mokhtar']
where training_id = 'TRN-20260728103131';

update public.training_sessions set trainer_names = array['Ayham Hammodi', 'Ayman Arikat']
where training_id = 'TRN-20260729092244';

update public.training_sessions set trainer_names = array['Ayham Hammodi']
where training_id = 'TRN-20260803110938';

update public.training_sessions set trainer_names = array['Muhammed Zawahir']
where training_id = 'TRN-20260803113419';

update public.training_sessions set trainer_names = array['Aiman Radwan']
where training_id = 'TRN-20260803160818';

-- TRN-20260803153004 is intentionally absent: it already held
-- 'Ahmed Mokhtar Elsayed Elaktaa' and the forward migration did not touch it.

-- Verification: back to 6 distinct names.
do $$
declare distinct_names int;
begin
  select count(*) into distinct_names
  from (select distinct unnest(trainer_names) from public.training_sessions) t;
  if distinct_names <> 6 then
    raise exception 'expected 6 distinct trainer names after rollback, found %', distinct_names;
  end if;
end $$;
