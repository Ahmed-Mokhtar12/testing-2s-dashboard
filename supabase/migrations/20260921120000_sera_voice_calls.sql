-- 20260921120000_sera_voice_calls.sql
--
-- WHY. ElevenLabs keeps Sera's voice conversations for 30 days only, and the dashboard
-- has no page for them. This migration creates the archive the "Sera Voice - Call Archive"
-- n8n workflow fills (one row per conversation + turns + tool events + the raw payload)
-- and the read model `sera_voice_calls_v` the dashboard page queries. Contract:
-- voice-dashboard-2026-09-21/SCHEMA.md (Phase 1).
--
-- WRITERS. Only n8n, through its Postgres credential, which connects as `postgres`
-- (owner, rolbypassrls = true). RLS is ENABLED, not FORCED, and nothing is revoked from
-- postgres or service_role, so the archive workflow's upserts are unaffected by RLS.
--
-- READERS. The dashboard, as `authenticated`, gated by public.is_hotel_staff(auth.uid())
-- (same gate as every other data table in this project). `anon` gets nothing.
-- `sera_voice_call_payloads` (the raw API object) gets NO grant and NO policy: it exists
-- for re-transforms by postgres/service_role only and is never read by src/.
--
-- call_date is set by a BEFORE trigger, not a generated column: timezone() is STABLE, and
-- Postgres refuses non-IMMUTABLE expressions in generated columns.

-- ---------------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------------
create table if not exists public.sera_voice_calls (
  conversation_id     text primary key,
  agent_id            text not null,
  branch_id           text,
  version_id          text,
  status              text not null,
  archive_state       text not null
                      constraint sera_voice_calls_archive_state_check
                      check (archive_state in ('pending', 'final', 'unanswered', 'stale')),
  started_at          timestamptz not null,
  accepted_at         timestamptz,
  ended_at            timestamptz,
  call_date           date not null,
  duration_secs       integer not null default 0,
  answer_delay_secs   integer,
  message_count       integer,
  direction           text,
  caller_extension    text,
  sip_caller_type     text,
  sip_call_time       text,
  termination_reason  text,
  error               text,
  warnings            jsonb,
  call_successful     text,
  call_success_score  numeric,
  summary_title       text,
  summary             text,
  sentiment           jsonb,
  main_language       text,
  cost_credits        integer,
  cost_usd            numeric(10,6),
  llm_cost_usd        numeric(10,6),
  charging            jsonb,
  tools_used          text[],
  tool_error_count    integer not null default 0,
  interruption_count  integer not null default 0,
  analysis_ready      boolean not null default false,
  retry_count         integer not null default 0,
  fetched_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create table if not exists public.sera_voice_call_turns (
  conversation_id     text not null references public.sera_voice_calls (conversation_id) on delete cascade,
  turn_index          integer not null,
  role                text not null,
  message             text,
  time_in_call_secs   integer,
  interrupted         boolean not null default false,
  tool_calls          jsonb,
  tool_results        jsonb,
  llm_usage           jsonb,
  primary key (conversation_id, turn_index)
);

create table if not exists public.sera_voice_call_tool_events (
  id                  bigint generated always as identity primary key,
  conversation_id     text not null references public.sera_voice_calls (conversation_id) on delete cascade,
  turn_index          integer not null,
  event_index         integer not null,
  tool_name           text not null,
  params              jsonb,
  result_status       text,
  result_excerpt      text,
  is_error            boolean not null default false,
  latency_secs        numeric,
  request_id          text,
  constraint sera_voice_call_tool_events_conv_turn_event_key unique (conversation_id, turn_index, event_index)
);

create table if not exists public.sera_voice_call_payloads (
  conversation_id     text primary key references public.sera_voice_calls (conversation_id) on delete cascade,
  payload             jsonb not null,
  fetched_at          timestamptz not null default now()
);

-- ---------------------------------------------------------------------------------
-- Trigger: call_date (Dubai calendar day), ended_at, updated_at
-- ---------------------------------------------------------------------------------
create or replace function public.sera_voice_calls_set_dates()
returns trigger
language plpgsql
set search_path = ''
as $fn$
begin
  new.call_date  := (new.started_at at time zone 'Asia/Dubai')::date;
  new.ended_at   := new.started_at + make_interval(secs => new.duration_secs);
  new.updated_at := now();
  return new;
end
$fn$;

create or replace trigger sera_voice_calls_set_dates_trg
  before insert or update on public.sera_voice_calls
  for each row execute function public.sera_voice_calls_set_dates();

-- ---------------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------------
create index if not exists sera_voice_calls_call_date_idx
  on public.sera_voice_calls (call_date);
create index if not exists sera_voice_calls_started_at_idx
  on public.sera_voice_calls (started_at desc);
create index if not exists sera_voice_calls_pending_idx
  on public.sera_voice_calls (archive_state) where archive_state = 'pending';
create index if not exists sera_voice_call_tool_events_tool_name_idx
  on public.sera_voice_call_tool_events (tool_name);

-- ---------------------------------------------------------------------------------
-- Read model. security_invoker so the caller's RLS applies (no privilege escalation
-- through the view). Columns enumerated on purpose: `charging` stays out.
-- ---------------------------------------------------------------------------------
drop view if exists public.sera_voice_calls_v;
create view public.sera_voice_calls_v with (security_invoker = true) as
select
  c.conversation_id,
  c.agent_id,
  c.branch_id,
  c.version_id,
  c.status,
  c.archive_state,
  c.started_at,
  c.accepted_at,
  c.ended_at,
  c.call_date,
  c.duration_secs,
  c.answer_delay_secs,
  c.message_count,
  c.direction,
  c.caller_extension,
  c.sip_caller_type,
  c.sip_call_time,
  c.termination_reason,
  c.error,
  c.warnings,
  c.call_successful,
  c.call_success_score,
  c.summary_title,
  c.summary,
  c.sentiment,
  c.main_language,
  c.cost_credits,
  c.cost_usd,
  c.llm_cost_usd,
  c.tools_used,
  c.tool_error_count,
  c.interruption_count,
  c.analysis_ready,
  c.retry_count,
  c.fetched_at,
  c.updated_at,
  (c.status = 'done' and c.duration_secs > 0)                                    as is_answered,
  (
    select nullif(regexp_replace(e.params ->> 'dtmf_tones', '[#*]', '', 'g'), '')
    from public.sera_voice_call_tool_events e
    where e.conversation_id = c.conversation_id
      and e.tool_name = 'play_keypad_touch_tone'
      and e.is_error = false and e.result_status = 'success'   -- a failed tone is not a transfer
    order by e.turn_index desc, e.event_index desc
    limit 1
  )                                                                              as transferred_to,
  exists (
    select 1 from public.sera_voice_call_tool_events e
    where e.conversation_id = c.conversation_id
      and e.tool_name = 'GetRoomRate' and e.result_status = 'success'
  )                                                                              as room_rate_quoted,
  exists (
    select 1 from public.sera_voice_call_tool_events e
    where e.conversation_id = c.conversation_id
      and e.tool_name = 'Webhook-2S_Communication' and e.result_status = 'success'
  )                                                                              as qms_request,
  case when c.duration_secs > 0 then c.cost_usd / (c.duration_secs / 60.0) end   as cost_per_minute_usd,
  round(c.duration_secs / 60.0, 2)                                               as duration_minutes
from public.sera_voice_calls c;

-- ---------------------------------------------------------------------------------
-- RLS + privileges. Revoke first (the platform's default privileges hand every new
-- relation to anon/authenticated), then grant back only what the dashboard needs.
-- ---------------------------------------------------------------------------------
alter table public.sera_voice_calls            enable row level security;
alter table public.sera_voice_call_turns       enable row level security;
alter table public.sera_voice_call_tool_events enable row level security;
alter table public.sera_voice_call_payloads    enable row level security;

revoke all on table public.sera_voice_calls            from anon, authenticated;
revoke all on table public.sera_voice_call_turns       from anon, authenticated;
revoke all on table public.sera_voice_call_tool_events from anon, authenticated;
revoke all on table public.sera_voice_call_payloads    from anon, authenticated;
revoke all on table public.sera_voice_calls_v          from anon, authenticated;
revoke all on sequence public.sera_voice_call_tool_events_id_seq from anon, authenticated;

grant select on public.sera_voice_calls            to authenticated;
grant select on public.sera_voice_call_turns       to authenticated;
grant select on public.sera_voice_call_tool_events to authenticated;
grant select on public.sera_voice_calls_v          to authenticated;

drop policy if exists "Hotel staff can read sera_voice_calls" on public.sera_voice_calls;
create policy "Hotel staff can read sera_voice_calls" on public.sera_voice_calls
  for select to authenticated
  using (public.is_hotel_staff(auth.uid()));

drop policy if exists "Hotel staff can read sera_voice_call_turns" on public.sera_voice_call_turns;
create policy "Hotel staff can read sera_voice_call_turns" on public.sera_voice_call_turns
  for select to authenticated
  using (public.is_hotel_staff(auth.uid()));

drop policy if exists "Hotel staff can read sera_voice_call_tool_events" on public.sera_voice_call_tool_events;
create policy "Hotel staff can read sera_voice_call_tool_events" on public.sera_voice_call_tool_events
  for select to authenticated
  using (public.is_hotel_staff(auth.uid()));

-- ---------------------------------------------------------------------------------
-- Verification. Refuse to finish unless every privilege assertion in SCHEMA.md holds
-- AND the schema behaves: a probe call + two tool events must come out of the view
-- with the right derived flags, the CHECK must refuse a bad archive_state, and the
-- probe must be gone afterwards. A refused privilege is proof; a setting is not
-- (CLAUDE.md, Database).
-- ---------------------------------------------------------------------------------
do $$
declare
  t text; v text;
  all_tables text[] := array['sera_voice_calls','sera_voice_call_turns','sera_voice_call_tool_events','sera_voice_call_payloads'];
  readable   text[] := array['sera_voice_calls','sera_voice_call_turns','sera_voice_call_tool_events','sera_voice_calls_v'];
  n int;
  rec record;
begin
  -- catalogue: RLS on, view is security_invoker, trigger + policies exist
  foreach t in array all_tables loop
    if not (select relrowsecurity from pg_class where oid = format('public.%I', t)::regclass) then
      raise exception 'RLS off on %', t;
    end if;
  end loop;
  if not coalesce((select reloptions @> array['security_invoker=true'] from pg_class
                   where oid = 'public.sera_voice_calls_v'::regclass), false) then
    raise exception 'sera_voice_calls_v is not security_invoker';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'sera_voice_calls_set_dates_trg'
                 and tgrelid = 'public.sera_voice_calls'::regclass) then
    raise exception 'trigger sera_voice_calls_set_dates_trg missing';
  end if;
  select count(*) into n from pg_policies
   where schemaname = 'public' and tablename = any(all_tables) and roles = '{authenticated}' and cmd = 'SELECT';
  if n <> 3 then raise exception 'expected 3 staff read policies, found %', n; end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'sera_voice_call_payloads') then
    raise exception 'sera_voice_call_payloads must have no policy';
  end if;

  -- privileges: anon nothing on 4 tables + view; authenticated select-only on 3 tables + view, nothing on payloads
  foreach t in array all_tables || array['sera_voice_calls_v'] loop
    foreach v in array array['SELECT','INSERT','UPDATE','DELETE'] loop
      if has_table_privilege('anon', format('public.%I', t), v) then
        raise exception 'anon still holds % on %', v, t;
      end if;
    end loop;
  end loop;
  foreach v in array array['SELECT','INSERT','UPDATE','DELETE'] loop
    if has_table_privilege('authenticated', 'public.sera_voice_call_payloads', v) then
      raise exception 'authenticated holds % on sera_voice_call_payloads', v;
    end if;
  end loop;
  foreach t in array readable loop
    if not has_table_privilege('authenticated', format('public.%I', t), 'SELECT') then
      raise exception 'authenticated cannot SELECT %', t;
    end if;
    foreach v in array array['INSERT','UPDATE','DELETE'] loop
      if has_table_privilege('authenticated', format('public.%I', t), v) then
        raise exception 'authenticated holds % on %', v, t;
      end if;
    end loop;
  end loop;
  if not (select rolbypassrls from pg_roles where rolname = 'postgres') then
    raise exception 'postgres lost BYPASSRLS - the n8n writer would now be subject to RLS; abort';
  end if;

  -- behaviour: probe call started 21:30 UTC on 18 Sep = 01:30 Dubai on 19 Sep
  delete from public.sera_voice_calls where conversation_id = 'probe_migration';
  insert into public.sera_voice_calls
    (conversation_id, agent_id, status, archive_state, started_at, duration_secs, cost_usd)
  values
    ('probe_migration', 'probe', 'done', 'final', '2026-09-18 21:30:00+00', 66, 0.14);
  insert into public.sera_voice_call_tool_events
    (conversation_id, turn_index, event_index, tool_name, params, result_status)
  values
    ('probe_migration', 3, 0, 'play_keypad_touch_tone', '{"dtmf_tones":"##8008"}'::jsonb, 'success'),
    ('probe_migration', 1, 0, 'GetRoomRate', '{"room_type":"probe"}'::jsonb, 'success');

  select * into rec from public.sera_voice_calls_v where conversation_id = 'probe_migration';
  if rec.conversation_id is null then raise exception 'probe row not visible through the view'; end if;
  if rec.call_date <> date '2026-09-19' then raise exception 'call_date wrong: % (expected 2026-09-19 Dubai)', rec.call_date; end if;
  if rec.ended_at <> timestamptz '2026-09-18 21:31:06+00' then raise exception 'ended_at wrong: %', rec.ended_at; end if;
  if rec.transferred_to is distinct from '8008' then raise exception 'transferred_to wrong: %', rec.transferred_to; end if;
  if not rec.room_rate_quoted then raise exception 'room_rate_quoted should be true'; end if;
  if rec.qms_request then raise exception 'qms_request should be false'; end if;
  if not rec.is_answered then raise exception 'is_answered should be true'; end if;
  if rec.cost_per_minute_usd is null or rec.cost_per_minute_usd not between 0.12 and 0.13 then
    raise exception 'cost_per_minute_usd wrong: %', rec.cost_per_minute_usd;
  end if;
  if rec.duration_minutes <> 1.10 then raise exception 'duration_minutes wrong: %', rec.duration_minutes; end if;

  -- the CHECK must refuse an unknown archive_state
  begin
    update public.sera_voice_calls set archive_state = 'bogus' where conversation_id = 'probe_migration';
    raise exception 'archive_state CHECK did not fire';
  exception when check_violation then
    null;
  end;

  -- clean up and prove it (cascade must clear the child rows too)
  delete from public.sera_voice_calls where conversation_id = 'probe_migration';
  select count(*) into n from public.sera_voice_calls where conversation_id = 'probe_migration';
  if n <> 0 then raise exception 'probe call row survived delete'; end if;
  select count(*) into n from public.sera_voice_call_tool_events where conversation_id = 'probe_migration';
  if n <> 0 then raise exception 'probe tool events survived cascade delete'; end if;
end $$;
