-- ROLLBACK for 20260802230000_sharepoint_mirror.sql.
--
-- NOT APPLIED AUTOMATICALLY — this file exists so the undo is one paste rather
-- than one recollection.
--
-- WHAT IT COSTS. Nothing is lost: the table holds only a copy of what
-- sp-read-colleagues, sp-read-columns and sp-read-trainers return, and each one
-- refetches from Graph when the mirror is absent. Dropping it puts the Hotel
-- Training page back on the measured 3.5-3.8 s (worst case 15.7 s) path, and
-- nothing else changes.
--
-- ORDER OF OPERATIONS MATTERS. Dropping this table while the deployed edge
-- functions still write to it is safe by construction — writeMirror swallows and
-- logs its own failures precisely so a mirror problem can never fail a read — but
-- every read will then log a PostgREST 404 per call. If the rollback is meant to
-- be permanent, redeploy the four functions from a commit without the mirror
-- calls first, then run this.
--
-- The frontend is safe in either order: readMirror treats any error, missing row
-- or stale row as "no mirror" and falls through to invoking the function.

drop table if exists public.sharepoint_mirror;
drop function if exists public.sharepoint_mirror_touch();
