-- ROLLBACK for 20260730150000_admin_via_user_roles.sql — restores the
-- pre-swap email-array policies verbatim (captured from live pg_policies
-- before the swap). Apply via MCP/psql; NOT a migration (this directory
-- is not scanned by the CLI, so it never replays on db reset).

drop policy "admins can read all training sessions" on public.training_sessions;
create policy "admins can read all training sessions"
  on public.training_sessions for select to authenticated
  using (lower((auth.jwt() ->> 'email'::text)) = ANY (ARRAY['ahmed.mokhtar@2seasonshotels.com'::text, 'amir.monir@2seasonshotels.com'::text, 'xarmaigne.narciso@2seasonshotels.com'::text]));

drop policy "admins can read all participants" on public.training_participants;
create policy "admins can read all participants"
  on public.training_participants for select to authenticated
  using (lower((auth.jwt() ->> 'email'::text)) = ANY (ARRAY['ahmed.mokhtar@2seasonshotels.com'::text, 'amir.monir@2seasonshotels.com'::text, 'xarmaigne.narciso@2seasonshotels.com'::text]));

drop policy "admins can read sync queue" on public.training_sync_queue;
create policy "admins can read sync queue"
  on public.training_sync_queue for select to authenticated
  using (lower((auth.jwt() ->> 'email'::text)) = ANY (ARRAY['ahmed.mokhtar@2seasonshotels.com'::text, 'amir.monir@2seasonshotels.com'::text, 'xarmaigne.narciso@2seasonshotels.com'::text]));
