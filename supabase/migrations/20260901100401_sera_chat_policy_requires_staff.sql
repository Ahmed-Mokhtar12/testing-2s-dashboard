-- 20260901100401_sera_chat_policy_requires_staff.sql
--
-- 20260901100400 scoped 2s-dashboard_AI_Chat reads to "own rows or admin". Verified live
-- right after applying it: the one role-less account (sera@) could still read its own 4
-- historical rows, because "own" does not imply "staff". Every other data table in this
-- project gates on is_hotel_staff first; make this one consistent. No n8n reader.
drop policy if exists "users read their own sera chats; admins read all" on public."2s-dashboard_AI_Chat";
create policy "staff read their own sera chats; admins read all" on public."2s-dashboard_AI_Chat"
  for select to authenticated
  using (
    public.is_hotel_staff(auth.uid())
    and (user_id = auth.uid() or public.has_role(auth.uid(), 'admin'))
  );
