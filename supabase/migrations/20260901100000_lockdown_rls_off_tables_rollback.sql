-- Rollback for 20260901100000_lockdown_rls_off_tables.sql
--
-- COST OF ROLLING BACK: re-opens world read / write / delete of guest QMS requests and the
-- integrity and backup tables through the published anon key. Only apply if an anonymous
-- or authenticated consumer is discovered — none exists in src/, supabase/functions/ or
-- any active n8n workflow as of 2026-09-01.

grant all on table public.qms_request_log to anon, authenticated;
grant all on table public.integrity_check_history to anon, authenticated;
grant all on table public.n8n_chat_histories_backup_serafix_20260824 to anon, authenticated;

alter table public.qms_request_log disable row level security;
alter table public.integrity_check_history disable row level security;
alter table public.n8n_chat_histories_backup_serafix_20260824 disable row level security;
