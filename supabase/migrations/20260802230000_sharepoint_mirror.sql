-- A Postgres mirror of the three SharePoint read results, so the Hotel Training
-- page stops waiting on cold edge functions to render.
--
-- WHY. Measured (docs/perf/hotel-training-baseline.md): the page fires
-- sp-read-colleagues, sp-read-columns and sp-read-trainers in parallel and the
-- participant step waits on the slowest — 3.5-3.8 s typically, 15.7 s once. That
-- cost is almost entirely EDGE COLD START, not SharePoint: on one load
-- sp-read-trainers served from its own in-memory cache, never called Graph, and
-- still took 2474 ms. A trivial control function costs 253-283 ms warm and
-- 2142-2548 ms cold.
--
-- PostgREST is always warm. Serving the same three payloads from a table turns
-- three cold isolate starts into three ~100 ms REST reads.
--
-- WRITE-THROUGH, not a scheduled job. Each sp-read-* function upserts its result
-- here after every successful Graph read, and sp-manage-colleague deletes the
-- 'colleagues' row after a successful member add/edit/remove. That means:
--   - no new secret and no pg_cron/pg_net path to fail silently;
--   - no second copy of the Graph-reading logic to drift from the first;
--   - an empty or stale mirror degrades to EXACTLY today's behaviour, because the
--     client falls back to invoking the function and awaiting it.
--
-- WHY jsonb AND NOT THREE TYPED TABLES. What is being cached is "the last
-- successful response", byte for byte. Typed columns would add a second schema to
-- keep in step with the response shape for no reader that wants it — every
-- consumer already has TypeScript types for these payloads.
--
-- KEY IS CONSTRAINED ON PURPOSE. A typo'd key would not error; it would write a
-- row nobody reads and silently restore the 3.5 s path, which is the hardest
-- class of bug to notice here. Adding a fourth mirror is then a deliberate,
-- reviewed migration rather than a string literal in an edge function.
--
-- ROLLBACK: supabase/migrations/20260802230000_sharepoint_mirror_rollback.sql

create table public.sharepoint_mirror (
  key text primary key check (key in ('colleagues', 'trainers', 'columns')),
  payload jsonb not null,
  fetched_at timestamptz not null default now()
);

-- fetched_at is maintained by the database, not by the caller. PostgREST's upsert
-- (Prefer: resolution=merge-duplicates) only updates the columns present in the
-- request body, so a writer that sent just {key, payload} would leave fetched_at
-- frozen at the FIRST insert — and the mirror would read as permanently stale
-- while looking perfectly healthy. This makes that impossible rather than
-- documented.
create function public.sharepoint_mirror_touch()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.fetched_at := now();
  return new;
end;
$$;

create trigger sharepoint_mirror_touch
  before insert or update on public.sharepoint_mirror
  for each row execute function public.sharepoint_mirror_touch();

alter table public.sharepoint_mirror enable row level security;

-- Signed-in users read. That is the same audience the sp-read-* functions already
-- serve: each one returns 401 without a resolvable caller.
create policy "authenticated can read the sharepoint mirror"
  on public.sharepoint_mirror
  for select
  to authenticated
  using (true);

-- No write policy for anyone, deliberately. Only the service role writes, and the
-- service role bypasses RLS. With a write policy, any signed-in colleague could
-- replace the colleague list, the trainer list or the column types for everybody
-- — the mirror is read by every user, so a write here is a write to everyone's UI.
--
-- CLAUDE.md: RLS is not sufficient on its own. `anon` holds Supabase's default
-- blanket grants, so a new table in `public` starts world-readable AND
-- world-writable through the anon key that ships in every frontend bundle. Revoke
-- the grants as well, and check has_table_privilege — not just relrowsecurity.
revoke all on public.sharepoint_mirror from anon;
revoke all on public.sharepoint_mirror from authenticated;
grant select on public.sharepoint_mirror to authenticated;
