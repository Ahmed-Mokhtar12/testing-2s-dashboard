-- supabase/migrations/20260727100000_hotel_training_rls_fixes.sql
-- (a) Case-insensitive INSERT check (match the participants policy).
-- (b) Owners can UPDATE their own sessions (needed for sync_status='partial').

drop policy "users can insert training sessions" on public.training_sessions;

create policy "users can insert training sessions"
  on public.training_sessions for insert to authenticated
  with check (lower(submitted_by) = lower(auth.jwt()->>'email'));

create policy "users can update their own training sessions"
  on public.training_sessions for update to authenticated
  using (lower(submitted_by) = lower(auth.jwt()->>'email'))
  with check (lower(submitted_by) = lower(auth.jwt()->>'email'));
