-- Staff can persist their own Sera chat turns (dashboard AI panel).
create policy "Staff can insert own sera chats"
  on public."2s-dashboard_AI_Chat" for insert to authenticated
  with check (public.is_hotel_staff(auth.uid()) and user_id = auth.uid());

-- Staff can read their own chats (existing policy covers staff-wide read; keep as-is).

-- Sera writes conversation memory as the calling user.
create policy "Staff can insert LongTermMemory"
  on public."LongTermMemory" for insert to authenticated
  with check (public.is_hotel_staff(auth.uid()));
