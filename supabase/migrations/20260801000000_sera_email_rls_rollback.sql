-- ROLLBACK for 20260801000000_sera_email_rls.sql.
--
-- NOT APPLIED AUTOMATICALLY — this file exists so the undo is one paste rather
-- than one recollection. Run it only if writes to these tables stopped after
-- the lockdown, which would mean the n8n workflow that populates them
-- authenticates with the anon key rather than the service role.
--
-- Be clear about what running this restores: it makes all four tables
-- anonymously READABLE, INSERTABLE, UPDATABLE and DELETABLE again with the
-- public anon key, because the `anon` role's blanket grants are still in place
-- underneath. It buys back a broken pipeline at the cost of reopening the hole.
--
-- The better fix, if it comes to that, is to point the n8n Supabase credential
-- at the service role instead — the same credential the Sera email runtime
-- already uses to write sera_email_inbox_log, which has been RLS-locked with
-- zero policies this whole time and is still receiving rows.

alter table public.sera_email_regression_cases      disable row level security;
alter table public.sera_email_regression_runs       disable row level security;
alter table public.sera_email_patch_history         disable row level security;
alter table public.sera_email_recommendation_ledger disable row level security;
