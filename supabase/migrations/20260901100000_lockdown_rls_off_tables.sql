-- 20260901100000_lockdown_rls_off_tables.sql
--
-- WHY. Three tables created by platform-only migrations (2026-08-24 / 2026-08-30) started
-- life with RLS off and the platform's blanket grants to anon/authenticated, so anyone
-- holding the published anon key could read, insert, update and delete them through
-- REST and GraphQL (advisor ERROR rls_disabled_in_public x3, verified 2026-09-01):
--   qms_request_log                              guest name / room / reservation / request text
--   integrity_check_history                      Sera integrity-monitor output
--   n8n_chat_histories_backup_serafix_20260824   15 rows of chat history
--
-- WRITERS ARE UNAFFECTED BY DESIGN. All three are written by n8n through its Postgres
-- credential, which connects as `postgres` — owner of every public table and
-- rolbypassrls = true. RLS is ENABLED, not FORCED, and nothing is revoked from postgres
-- or service_role, so those writes continue exactly as before. Nothing in src/ or
-- supabase/functions/ reads these tables.

alter table public.qms_request_log enable row level security;
alter table public.integrity_check_history enable row level security;
alter table public.n8n_chat_histories_backup_serafix_20260824 enable row level security;

revoke all on table public.qms_request_log from anon, authenticated;
revoke all on table public.integrity_check_history from anon, authenticated;
revoke all on table public.n8n_chat_histories_backup_serafix_20260824 from anon, authenticated;

-- Refuse to finish if the hole is still open. A refused privilege is proof; a setting
-- is not (CLAUDE.md, Database).
do $$
declare t text; r text; v text;
begin
  foreach t in array array['qms_request_log','integrity_check_history','n8n_chat_histories_backup_serafix_20260824'] loop
    if not (select relrowsecurity from pg_class where oid = format('public.%I', t)::regclass) then
      raise exception 'RLS still off on %', t;
    end if;
    foreach r in array array['anon','authenticated'] loop
      foreach v in array array['SELECT','INSERT','UPDATE','DELETE'] loop
        if has_table_privilege(r, format('public.%I', t), v) then
          raise exception '% still holds % on %', r, v, t;
        end if;
      end loop;
    end loop;
  end loop;
  if not (select rolbypassrls from pg_roles where rolname = 'postgres') then
    raise exception 'postgres lost BYPASSRLS — the n8n writer would now be subject to RLS; abort';
  end if;
end $$;
