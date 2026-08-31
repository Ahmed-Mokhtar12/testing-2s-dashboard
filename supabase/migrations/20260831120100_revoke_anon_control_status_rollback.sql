-- Rollback for 20260831120100_revoke_anon_control_status.sql
--
-- COST OF ROLLING BACK: restores anonymous probing of per-number takeover
-- state through the SECURITY DEFINER function — the regression this migration
-- exists to close. Only apply if some anonymous consumer is discovered that
-- genuinely needs it (none is known; verify before granting).

GRANT EXECUTE ON FUNCTION public.is_conversation_human_controlled(text) TO anon;
