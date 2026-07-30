-- New accounts get NO role. Roles are granted explicitly by an admin
-- (user_roles INSERT is already restricted to has_role(uid,'admin')).
--
-- Previously, on_auth_user_created_role granted 'admin' to the first user
-- and 'staff' to every user after — so any signup (or any account created
-- while public signup was enabled) became hotel staff automatically, and
-- is_hotel_staff() then opened every staff-gated surface to it. Public
-- signup has been disabled at the platform level; this removes the second
-- layer so re-enabling signup can never silently restore staff-by-default.
--
-- Operational consequence: provisioning a new dashboard user now requires
-- an explicit INSERT into public.user_roles by an admin after creating the
-- auth user.

drop trigger if exists on_auth_user_created_role on auth.users;
drop function if exists public.handle_new_user_role();
