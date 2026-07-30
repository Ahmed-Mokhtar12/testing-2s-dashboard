-- Single source of admin truth: user_roles + has_role(). Replaces the
-- hardcoded 3-email arrays in the training SELECT policies.
--
-- Applied 2026-07-30 after verifying has_role(uid,'admin') = true live for
-- all three admins (ahmed.mokhtar, amir.monir, xarmaigne.narciso — the
-- latter two provisioned the same day; roles are granted explicitly now
-- that the signup auto-role trigger is gone, see 20260730140000).
-- Rollback: supabase/rollbacks/20260730150000_admin_via_user_roles.sql
-- restores the email-array policies verbatim in one apply.

drop policy "admins can read all training sessions" on public.training_sessions;
create policy "admins can read all training sessions"
  on public.training_sessions for select to authenticated
  using (public.has_role(auth.uid(), 'admin'::app_role));

drop policy "admins can read all participants" on public.training_participants;
create policy "admins can read all participants"
  on public.training_participants for select to authenticated
  using (public.has_role(auth.uid(), 'admin'::app_role));

drop policy "admins can read sync queue" on public.training_sync_queue;
create policy "admins can read sync queue"
  on public.training_sync_queue for select to authenticated
  using (public.has_role(auth.uid(), 'admin'::app_role));
