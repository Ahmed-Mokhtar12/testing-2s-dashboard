-- 20260901100100_revoke_anon_role_oracles.sql
--
-- has_role(uuid, app_role) and is_hotel_staff(uuid) are SECURITY DEFINER and were created
-- with Postgres's default EXECUTE grant to PUBLIC, so the anon key could ask
-- "is <uuid> an admin?" for any uuid (uuids leak through replied_by_user_id on every
-- human-reply row). Verified live 2026-09-01: has_function_privilege('anon', …) = true.
--
-- authenticated MUST keep EXECUTE: every RLS policy on staff-gated tables calls
-- is_hotel_staff(auth.uid()) as the invoker, training-report calls has_role as the
-- caller, and whatsapp-send-message calls is_hotel_staff through the service role.
-- No n8n workflow calls either function (dependency map, 2026-09-01).

grant execute on function public.has_role(uuid, public.app_role) to authenticated, service_role;
grant execute on function public.is_hotel_staff(uuid) to authenticated, service_role;

revoke execute on function public.has_role(uuid, public.app_role) from public, anon;
revoke execute on function public.is_hotel_staff(uuid) from public, anon;

do $$
begin
  if has_function_privilege('anon', 'public.has_role(uuid, public.app_role)', 'EXECUTE') then
    raise exception 'anon can still execute has_role';
  end if;
  if has_function_privilege('anon', 'public.is_hotel_staff(uuid)', 'EXECUTE') then
    raise exception 'anon can still execute is_hotel_staff';
  end if;
  if not has_function_privilege('authenticated', 'public.has_role(uuid, public.app_role)', 'EXECUTE') then
    raise exception 'authenticated lost has_role — every staff policy would now error';
  end if;
  if not has_function_privilege('authenticated', 'public.is_hotel_staff(uuid)', 'EXECUTE') then
    raise exception 'authenticated lost is_hotel_staff — every staff policy would now error';
  end if;
end $$;
