-- docs/security/ROLLBACK.sql
--
-- Reverses every DATABASE change indexed in docs/security/HANDOFF-2026-09-01.md
-- (project yczcebfaqerlwfalrbjn, shared by production and testing).
--
-- Source of truth for each statement: the forward migration in supabase/migrations/
-- (what was done) and the earlier migration that defined the pre-change object (what it
-- was). The *_rollback.sql siblings were cross-checked against those; where this file
-- differs from a sibling, the comment on the statement says why.
--
-- Order: reverse chronological, grouped by the plan phase that applied the change
-- (Phase 3 -> Phase 2 -> Phase 1). Ordering dependencies between statements are listed in
-- docs/security/ROLLBACK-NOTES.md §2 — read that before splitting this file.
--
-- Run as: postgres (the role the Supabase SQL editor and MCP execute_sql use). The cron
-- statement in Phase 2 fails under any other role, which aborts the whole transaction.
--
-- Single transaction: any error anywhere leaves the database exactly as it is now.
--
-- NOT in this file (no SQL can reverse them — see ROLLBACK-NOTES.md §3): the nine edge
-- functions redeployed 2026-09-01, the frontend deployed to testing at 14:58, the repo's
-- supabase/config.toml, and the platform's schema_migrations history rows.
--
-- Constraints honoured (plan N1–N7): no statement grants to, revokes from, or names the
-- two non-anon platform roles; no cron.job row other than 'rls-sentinel-daily' is read or
-- written; the "Chat History" INSERT trigger and its function are not touched; nothing
-- outside the handoff's object list is touched.

BEGIN;

-- =====================================================================================
-- PHASE 3 — Authorization consistency across edge functions and policies (plan T11)
-- Commit c70e49f, applied 2026-09-01 14:00 and 14:03 (+04)
-- =====================================================================================

-- ---- reverses c70e49f · supabase/migrations/20260901100401_sera_chat_policy_requires_staff.sql
-- Pre-change state: the policy "users read their own sera chats; admins read all" created by
-- 20260901100400 (same commit, three minutes earlier). Its definition is taken from that file.
-- CREATE POLICY has no IF NOT EXISTS; the DROP IF EXISTS before it is what makes this re-runnable.
DROP POLICY IF EXISTS "staff read their own sera chats; admins read all" ON public."2s-dashboard_AI_Chat";
DROP POLICY IF EXISTS "users read their own sera chats; admins read all" ON public."2s-dashboard_AI_Chat";
CREATE POLICY "users read their own sera chats; admins read all" ON public."2s-dashboard_AI_Chat"
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- ---- reverses c70e49f · supabase/migrations/20260901100400_scope_mirror_and_sera_chat_policies.sql
-- (a) sharepoint_mirror. Pre-change policy from 20260802230000_sharepoint_mirror.sql lines 66–70.
--     The table grants set by that same migration (SELECT to authenticated, nothing to anon) were
--     not changed on 2026-09-01 and are not touched here.
DROP POLICY IF EXISTS "staff can read the sharepoint mirror" ON public.sharepoint_mirror;
DROP POLICY IF EXISTS "authenticated can read the sharepoint mirror" ON public.sharepoint_mirror;
CREATE POLICY "authenticated can read the sharepoint mirror" ON public.sharepoint_mirror
  FOR SELECT TO authenticated
  USING (true);

-- (b) "2s-dashboard_AI_Chat". Pre-change policy "Hotel staff can read website_chats" was defined by
--     20260423145305 on public.website_chats; that table was renamed to "2s-dashboard_AI_Chat" outside
--     this repo (no rename migration exists here) and the policy name carried over — it is the name
--     20260901100400 dropped. Definition below is the 20260423145305 one, on the current table name.
--     The intermediate policy recreated in the block above is dropped again here, exactly as
--     20260901100400's own DROP would have found it: this file replays history backwards, so the
--     intermediate exists only between the two blocks, inside this transaction.
DROP POLICY IF EXISTS "users read their own sera chats; admins read all" ON public."2s-dashboard_AI_Chat";
DROP POLICY IF EXISTS "Hotel staff can read website_chats" ON public."2s-dashboard_AI_Chat";
CREATE POLICY "Hotel staff can read website_chats" ON public."2s-dashboard_AI_Chat"
  FOR SELECT TO authenticated
  USING (public.is_hotel_staff(auth.uid()));

-- =====================================================================================
-- PHASE 2 — Database integrity and detection (plan T8, T7)
-- Commits 7b90b95 and 1a23769, applied 2026-09-01 13:57 (+04)
-- =====================================================================================

-- ---- reverses 7b90b95 · supabase/migrations/20260901100300_chat_history_update_policy_and_freeze.sql
-- (a) The UPDATE policy. Pre-change definition from 20260423144901 lines 115–122 (verbatim).
DROP POLICY IF EXISTS "Hotel staff can update Chat History" ON public."Chat History";
CREATE POLICY "Hotel staff can update Chat History"
ON public."Chat History" FOR UPDATE
TO authenticated
USING (public.is_hotel_staff(auth.uid()))
WITH CHECK (
  public.is_hotel_staff(auth.uid())
  AND (replied_by_user_id IS NULL OR replied_by_user_id = auth.uid())
);

-- (b) The BEFORE UPDATE trigger function. 7b90b95 replaced the body with CREATE OR REPLACE; the
--     trigger definition itself was not changed and is not touched here. Body below is verbatim
--     from 20260731200000_chat_history_handled_by.sql lines 86–111, comments included.
--     The BEFORE INSERT trigger chat_history_stamp_handled_by and its function were not changed on
--     2026-09-01 and are not touched here.
create or replace function public.chat_history_freeze_handled_by()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.handled_by is not null then
    -- Frozen. Note this does NOT block updates to other columns: an UPDATE
    -- that leaves handled_by alone carries the old value forward unchanged, so
    -- `is distinct from` is false and nothing is raised. Only an actual
    -- rewrite of a stamped value is refused.
    if new.handled_by is distinct from old.handled_by then
      raise exception
        'handled_by is immutable once set (Chat History id %, % -> %)',
        old.id, old.handled_by, new.handled_by;
    end if;
  else
    -- Still unstamped: this is the one chance to record handling, e.g. an
    -- inbound guest row that later receives its reply by UPDATE.
    new.handled_by := public.chat_history_derive_handled_by(
      new.human_reply, new."Ai Reply", new."Sender Message"
    );
  end if;
  return new;
end;
$$;

-- ---- reverses 1a23769 · supabase/migrations/20260901100200_schedule_rls_sentinel.sql
-- Pre-change state: public.enforce_rls_on_public_tables() existed (platform migration
-- rls_sentinel_guard, 2026-08-20 — it has no file in this repo) and was NOT scheduled. The function,
-- its log/allowlist/state tables and their grants predate the handoff and are not touched.
-- Only the job with this exact name is read or removed; no other cron.job row is referenced.
-- cron.unschedule(name) raises if the job is absent, so the existence check is what makes this
-- idempotent. cron.unschedule must run as the job's owner (postgres); see ROLLBACK-NOTES.md §3.4.
-- ORDERING: this must run BEFORE the three DISABLE ROW LEVEL SECURITY statements in Phase 1 —
-- otherwise the 03:30 daily run switches RLS back on for those tables (it never touches grants).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'rls-sentinel-daily') THEN
    PERFORM cron.unschedule('rls-sentinel-daily');
  END IF;
END $$;

-- =====================================================================================
-- PHASE 1 — Close the unauthenticated surfaces (plan T2, T1)
-- Commits 667cea4 and d453f57, applied 2026-09-01 13:50 (+04)
-- =====================================================================================

-- ---- reverses 667cea4 · supabase/migrations/20260901100100_revoke_anon_role_oracles.sql
-- Forward migration: GRANT EXECUTE to authenticated and one other role, then REVOKE EXECUTE FROM
-- PUBLIC, anon. Pre-change ACL is not recorded as a statement anywhere in the repo: both functions
-- were created by 20260423144901 with no explicit GRANT, so they held PostgreSQL's implicit
-- PUBLIC EXECUTE plus the project's default privileges (ALTER DEFAULT PRIVILEGES FOR ROLE postgres
-- IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated — visible in the 2026-09-01 dump).
-- Both revoked grantees are therefore restored. The explicit grants 667cea4 added are left in
-- place: authenticated's is needed by every is_hotel_staff()/has_role() policy, and reversing the
-- other one would name a role this file must not touch; both are redundant once PUBLIC is back.
-- The sibling *_rollback.sql restores anon only; restoring PUBLIC as well is the faithful inverse.
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO anon;
GRANT EXECUTE ON FUNCTION public.is_hotel_staff(uuid) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_hotel_staff(uuid) TO anon;

-- ---- reverses b7d6634 (file) · supabase/migrations/20260831120100_revoke_anon_control_status.sql
--      (applied 2026-09-01 13:50 under 667cea4)
-- Pre-change ACL from supabase/migrations/20260515151238_*.sql lines 25–26: explicit
-- EXECUTE to anon, authenticated and one other role, plus implicit PUBLIC. The forward migration
-- revoked PUBLIC and anon; both are restored. The other two explicit grants were not touched by
-- the forward migration and are not touched here.
GRANT EXECUTE ON FUNCTION public.is_conversation_human_controlled(text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_conversation_human_controlled(text) TO anon;

-- ---- reverses d453f57 · supabase/migrations/20260901100000_lockdown_rls_off_tables.sql
-- Pre-change grants are NOT recoverable from the repo: none of the three tables was created by a
-- repo migration (qms_request_log by platform migration create_qms_request_log 2026-08-30; the other
-- two by no migration at all), and the pre-probe recorded in d453f57 only says "anon INSERT=true,
-- authenticated DELETE=true". What is restored is the project's default-privilege template for tables
-- created by postgres in schema public, as recorded in the 2026-09-01 dump — the template all three
-- received at creation (all three postdate revoke_anon_truncate_default_privileges, 2026-08-20):
--   anon:          SELECT, INSERT, REFERENCES, DELETE, TRIGGER, UPDATE          (no TRUNCATE)
--   authenticated: SELECT, INSERT, REFERENCES, DELETE, TRIGGER, TRUNCATE, UPDATE
-- This differs from the sibling *_rollback.sql, whose GRANT ALL would also hand anon TRUNCATE — a
-- privilege these tables never had, and one the sentinel function reports as anon_truncate_detected.
-- Sequence grants were not changed by the forward migration and are not touched here.
-- ORDERING: the cron job above must already be gone (or the run must be inside this transaction).
GRANT SELECT, INSERT, REFERENCES, DELETE, TRIGGER, UPDATE
  ON TABLE public.qms_request_log TO anon;
GRANT SELECT, INSERT, REFERENCES, DELETE, TRIGGER, TRUNCATE, UPDATE
  ON TABLE public.qms_request_log TO authenticated;
GRANT SELECT, INSERT, REFERENCES, DELETE, TRIGGER, UPDATE
  ON TABLE public.integrity_check_history TO anon;
GRANT SELECT, INSERT, REFERENCES, DELETE, TRIGGER, TRUNCATE, UPDATE
  ON TABLE public.integrity_check_history TO authenticated;
GRANT SELECT, INSERT, REFERENCES, DELETE, TRIGGER, UPDATE
  ON TABLE public.n8n_chat_histories_backup_serafix_20260824 TO anon;
GRANT SELECT, INSERT, REFERENCES, DELETE, TRIGGER, TRUNCATE, UPDATE
  ON TABLE public.n8n_chat_histories_backup_serafix_20260824 TO authenticated;

ALTER TABLE public.qms_request_log DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.integrity_check_history DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.n8n_chat_histories_backup_serafix_20260824 DISABLE ROW LEVEL SECURITY;

-- =====================================================================================
-- Refuse to commit unless the pre-change state is actually back.
-- (CLAUDE.md, Database: a setting is not proof; every forward migration checked its own effect
-- the same way, and a rollback that reports success without doing so is the failure mode
-- docs/testing-lessons.md exists to prevent.)
-- =====================================================================================
DO $$
DECLARE t text;
BEGIN
  -- Phase 1 / T2: anon can execute the three functions again; authenticated never lost them.
  IF NOT has_function_privilege('anon', 'public.has_role(uuid, public.app_role)', 'EXECUTE') THEN
    RAISE EXCEPTION 'rollback incomplete: anon still cannot execute has_role';
  END IF;
  IF NOT has_function_privilege('anon', 'public.is_hotel_staff(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'rollback incomplete: anon still cannot execute is_hotel_staff';
  END IF;
  IF NOT has_function_privilege('anon', 'public.is_conversation_human_controlled(text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'rollback incomplete: anon still cannot execute is_conversation_human_controlled';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.is_hotel_staff(uuid)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.has_role(uuid, public.app_role)', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated lost a role oracle — every staff policy would now error; aborting';
  END IF;

  -- Phase 1 / T1: RLS off and anon write access back on the three tables.
  FOREACH t IN ARRAY ARRAY['qms_request_log', 'integrity_check_history', 'n8n_chat_histories_backup_serafix_20260824'] LOOP
    IF (SELECT relrowsecurity FROM pg_class WHERE oid = format('public.%I', t)::regclass) THEN
      RAISE EXCEPTION 'rollback incomplete: RLS still on for %', t;
    END IF;
    IF NOT has_table_privilege('anon', format('public.%I', t), 'INSERT')
       OR NOT has_table_privilege('authenticated', format('public.%I', t), 'DELETE') THEN
      RAISE EXCEPTION 'rollback incomplete: pre-change grants not restored on %', t;
    END IF;
  END LOOP;

  -- Phase 2 / T7: the sentinel job is gone (and only that job was looked at).
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'rls-sentinel-daily') THEN
    RAISE EXCEPTION 'rollback incomplete: rls-sentinel-daily is still scheduled';
  END IF;

  -- Phase 2 / T8: UPDATE policy back; freeze function is the 2026-07-31 body again.
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'Chat History'
                   AND policyname = 'Hotel staff can update Chat History') THEN
    RAISE EXCEPTION 'rollback incomplete: "Hotel staff can update Chat History" missing';
  END IF;
  IF position('is distinct from old.human_reply' IN pg_get_functiondef('public.chat_history_freeze_handled_by()'::regprocedure)) > 0 THEN
    RAISE EXCEPTION 'rollback incomplete: chat_history_freeze_handled_by still has the 2026-09-01 body';
  END IF;

  -- Phase 3 / T11: the 2026-08 policies back, every 2026-09-01 policy gone.
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'sharepoint_mirror'
                   AND policyname = 'authenticated can read the sharepoint mirror')
     OR EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'sharepoint_mirror'
                   AND policyname = 'staff can read the sharepoint mirror') THEN
    RAISE EXCEPTION 'rollback incomplete: sharepoint_mirror policies are not the pre-change set';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = '2s-dashboard_AI_Chat'
                   AND policyname = 'Hotel staff can read website_chats')
     OR EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = '2s-dashboard_AI_Chat'
                   AND policyname IN ('staff read their own sera chats; admins read all',
                                      'users read their own sera chats; admins read all')) THEN
    RAISE EXCEPTION 'rollback incomplete: "2s-dashboard_AI_Chat" policies are not the pre-change set';
  END IF;
END $$;

COMMIT;
