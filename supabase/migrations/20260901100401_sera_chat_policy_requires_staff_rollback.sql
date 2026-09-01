-- Rollback for 20260901100401_sera_chat_policy_requires_staff.sql
-- COST OF ROLLING BACK: a role-less account can again read its own historical Sera rows.
drop policy if exists "staff read their own sera chats; admins read all" on public."2s-dashboard_AI_Chat";
create policy "users read their own sera chats; admins read all" on public."2s-dashboard_AI_Chat"
  for select to authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(), 'admin'));
