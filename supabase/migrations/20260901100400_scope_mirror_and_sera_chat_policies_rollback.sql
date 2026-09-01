-- Rollback for 20260901100400_scope_mirror_and_sera_chat_policies.sql
-- COST OF ROLLING BACK: any authenticated account (roleless included) can read the colleague
-- roster again, and every staff member can read every colleague's Sera transcripts again.
drop policy if exists "staff can read the sharepoint mirror" on public.sharepoint_mirror;
create policy "authenticated can read the sharepoint mirror" on public.sharepoint_mirror
  for select to authenticated using (true);

drop policy if exists "users read their own sera chats; admins read all" on public."2s-dashboard_AI_Chat";
create policy "Hotel staff can read website_chats" on public."2s-dashboard_AI_Chat"
  for select to authenticated using (public.is_hotel_staff(auth.uid()));
