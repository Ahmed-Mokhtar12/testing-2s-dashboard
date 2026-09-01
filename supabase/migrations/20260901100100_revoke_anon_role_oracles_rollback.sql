-- Rollback for 20260901100100_revoke_anon_role_oracles.sql
-- COST OF ROLLING BACK: restores the anonymous role oracle (anyone with the anon key can
-- test whether any uuid is admin/staff). Only if an anonymous consumer is found — none known.
grant execute on function public.has_role(uuid, public.app_role) to anon;
grant execute on function public.is_hotel_staff(uuid) to anon;
