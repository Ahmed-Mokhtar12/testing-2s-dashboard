-- is_conversation_human_controlled was REVOKEd from anon on 2026-04-23
-- (20260423141856), but 20260515151238_fix_whatsapp_control_status_rpc.sql
-- re-created the function with GRANT EXECUTE ... TO anon, authenticated,
-- service_role — silently undoing the revoke. The function is SECURITY DEFINER,
-- so since then any holder of the published anon key could probe per-number
-- human-takeover state. Verified live 2026-08-31: anon EXECUTE present.
--
-- Legitimate callers keep working: the dashboard calls it with the user's
-- authenticated session; n8n's credential is proven service-role (memory:
-- rls-gaps-2026-07-31); nothing anonymous consumes it.

REVOKE EXECUTE ON FUNCTION public.is_conversation_human_controlled(text) FROM PUBLIC, anon;
