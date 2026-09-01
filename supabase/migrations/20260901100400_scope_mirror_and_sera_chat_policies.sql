-- 20260901100400_scope_mirror_and_sera_chat_policies.sql
--
-- sharepoint_mirror held the full colleague roster (names, employee ids, positions) for
-- ANY authenticated account, roleless included (audit L8). 2s-dashboard_AI_Chat let every
-- staff member read every colleague's Sera transcripts through PostgREST (D5) — the edge
-- function already filters by user_id; the policy did not. Admins keep a cross-user read
-- for support. Neither table is read by n8n (dependency map 2026-09-01).

drop policy if exists "authenticated can read the sharepoint mirror" on public.sharepoint_mirror;
create policy "staff can read the sharepoint mirror" on public.sharepoint_mirror
  for select to authenticated using (public.is_hotel_staff(auth.uid()));

drop policy if exists "Hotel staff can read website_chats" on public."2s-dashboard_AI_Chat";
create policy "users read their own sera chats; admins read all" on public."2s-dashboard_AI_Chat"
  for select to authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(), 'admin'));

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'sharepoint_mirror' and policyname = 'staff can read the sharepoint mirror') then
    raise exception 'mirror policy missing';
  end if;
  if not exists (select 1 from pg_policies where tablename = '2s-dashboard_AI_Chat' and policyname = 'users read their own sera chats; admins read all') then
    raise exception 'sera chat policy missing';
  end if;
end $$;
