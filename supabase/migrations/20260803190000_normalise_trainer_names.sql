-- Normalise every recorded trainer name in training_sessions to the colleague's
-- ColleagueName, whitespace-collapsed — the value the app will write from the trainer
-- field onwards (see
-- docs/superpowers/specs/2026-08-03-trainer-field-is-the-participant-picker-design.md).
--
-- WHY. training_sessions.trainer_names is what the monthly report and Sera read, and
-- report-aggregator.ts dedupes with raw.trim().toLowerCase(). Of the six names ever
-- recorded, exactly ONE matched its ColleagueName:
--
--   recorded                        ColleagueName                    employeeId
--   Ahmed Mokhtar                   Ahmed Mokhtar Elsayed Elaktaa    101000
--   Ahmed Mokhtar Elsayed Elaktaa   (already exact)                  101000
--   Aiman Radwan                    Aiman Ibrahim Aly Radwan         101195
--   Ayham Hammodi                   Ayham Mooner Hammodi             102461
--   Ayman Arikat                    Ayman Khalil Darwish Erikat      100074
--   Muhammed Zawahir                Muhammed Muhammed  Zawahir       101710
--
-- Two separate defects follow from that:
--
-- 1. Ahmed is recorded under two spellings, which lowercasing cannot collapse, so
--    distinct_trainers reports 6 where the truth is 5 people.
-- 2. Once the trainer field writes ColleagueName, the OTHER four start being recorded
--    under different strings than their existing rows — so every report spanning the
--    cutover would count each of them twice. Fixing only Ahmed would leave that.
--
-- THE MAPPING WAS CONFIRMED BY INSPECTION, NOT COMPUTED. "Ayman Arikat" ->
-- "Ayman Khalil Darwish Erikat" differs in the surname's first letter (A/E); a
-- heuristic join missed him entirely on the first attempt and nearly recorded him as
-- having no colleague row. Algorithmic name matching is exactly what the spec refutes.
-- Six rows were mapped by eye and confirmed by the operator, corroborated by
-- department (session TRN-20260729092244 is Revenue; 100074 is Director of Revenue
-- & Sales).
--
-- WHITESPACE. Muhammed's ColleagueName contains a DOUBLE space. The canonical form
-- here is the whitespace-collapsed one, because that is what the app will write —
-- pre- and post-cutover values must be byte-identical or this migration achieves
-- nothing. The same collapse is part of the format contract in the spec.
--
-- IDEMPOTENT: array_replace on an exact old value is a no-op once applied. No session
-- holds two spellings of one person, so no array can gain a duplicate element; the
-- verification below asserts that rather than assuming it.

update public.training_sessions
set trainer_names = array_replace(trainer_names, 'Ahmed Mokhtar', 'Ahmed Mokhtar Elsayed Elaktaa')
where 'Ahmed Mokhtar' = any (trainer_names);

update public.training_sessions
set trainer_names = array_replace(trainer_names, 'Aiman Radwan', 'Aiman Ibrahim Aly Radwan')
where 'Aiman Radwan' = any (trainer_names);

update public.training_sessions
set trainer_names = array_replace(trainer_names, 'Ayham Hammodi', 'Ayham Mooner Hammodi')
where 'Ayham Hammodi' = any (trainer_names);

update public.training_sessions
set trainer_names = array_replace(trainer_names, 'Ayman Arikat', 'Ayman Khalil Darwish Erikat')
where 'Ayman Arikat' = any (trainer_names);

-- Target is the collapsed form, deliberately, not the raw double-spaced ColleagueName.
update public.training_sessions
set trainer_names = array_replace(trainer_names, 'Muhammed Zawahir', 'Muhammed Muhammed Zawahir')
where 'Muhammed Zawahir' = any (trainer_names);

-- Verification, in the migration so it cannot be skipped:
-- every recorded name is now one of the five canonical forms, no array holds a
-- duplicate, and the distinct count is 5.
do $$
declare
  stray text;
  dupes int;
  distinct_names int;
begin
  select string_agg(distinct n, ', ') into stray
  from (select unnest(trainer_names) as n from public.training_sessions) t
  where n not in (
    'Ahmed Mokhtar Elsayed Elaktaa',
    'Aiman Ibrahim Aly Radwan',
    'Ayham Mooner Hammodi',
    'Ayman Khalil Darwish Erikat',
    'Muhammed Muhammed Zawahir'
  );
  if stray is not null then
    raise exception 'trainer_names still holds non-canonical value(s): %', stray;
  end if;

  select count(*) into dupes
  from public.training_sessions
  where array_length(trainer_names, 1) <> (
    select count(distinct x) from unnest(trainer_names) x
  );
  if dupes > 0 then
    raise exception '% session(s) hold a duplicated trainer name after the rewrite', dupes;
  end if;

  select count(*) into distinct_names
  from (select distinct unnest(trainer_names) from public.training_sessions) t;
  if distinct_names <> 5 then
    raise exception 'expected 5 distinct trainer names, found %', distinct_names;
  end if;
end $$;
