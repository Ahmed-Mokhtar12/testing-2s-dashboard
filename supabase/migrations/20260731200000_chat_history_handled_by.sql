-- Immutable per-row record of WHO handled a WhatsApp exchange.
--
-- Why: "how many chats did a human handle" has been answered from
-- `is_human_controlled`, which is a MUTABLE conversation-level flag, not a
-- per-message fact. whatsapp-send-message updates it with
-- `.eq('Sender Number', n)` and no date bound, so taking over a conversation
-- today rewrites every historical row for that number. Live evidence at the
-- time of writing: 67 rows hold a guest message AND an `Ai Reply` — plainly
-- AI-handled exchanges — yet carry is_human_controlled = true. The flag says
-- 117 human rows; `human_reply` is non-blank on 98. Neither is trustworthy on
-- its own, and the flag is the one that can change under you.
--
-- The alternative considered and rejected was deriving handling at READ time
-- from `human_reply`. That is still a derivation over mutable columns, and it
-- cannot distinguish "no reply yet" from "system marker row". This column is
-- stamped once, at the moment handling first happens, and then frozen.
--
-- NO BACKFILL, by design. All pre-existing rows keep handled_by = NULL,
-- meaning "unknown, predates the stamp". Consumers must treat NULL as unknown
-- rather than as a category, and must not report stamp-based figures as
-- authoritative for a window that contains NULLs. The Sera tool enforces this
-- per query: it reports both signals until every row in the requested window
-- is stamped, then switches to this column and drops the caveat by itself.

alter table public."Chat History"
  add column if not exists handled_by text;

comment on column public."Chat History".handled_by is
  'Immutable record of who produced this row''s reply: ai | human | system. '
  'Stamped by trigger when handling first occurs and frozen thereafter. '
  'NULL means either "predates 2026-07-31" or "inbound guest message not yet '
  'replied to" — always unknown, never a category. Prefer this over '
  'is_human_controlled, which is a mutable conversation-level flag that gets '
  'rewritten across a sender''s whole history on takeover.';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'chat_history_handled_by_check'
  ) then
    alter table public."Chat History"
      add constraint chat_history_handled_by_check
      check (handled_by is null or handled_by in ('ai', 'human', 'system'));
  end if;
end $$;

-- The derivation, in one place so INSERT and UPDATE cannot drift apart.
-- Order matters: human_reply wins over "Ai Reply" because a human reply row
-- can also carry AI context, and the human is the one who handled it.
create or replace function public.chat_history_derive_handled_by(
  _human_reply text, _ai_reply text, _sender_message text
) returns text
language sql immutable
set search_path = public
as $$
  select case
    when nullif(btrim(coalesce(_human_reply, '')), '') is not null then 'human'
    when nullif(btrim(coalesce(_ai_reply, '')), '')    is not null then 'ai'
    -- No message text of any kind: a takeover/release marker row inserted by
    -- whatsapp-send-message purely to anchor a timestamp.
    when nullif(btrim(coalesce(_sender_message, '')), '') is null  then 'system'
    -- Guest message with no reply of any kind: genuinely not handled YET.
    -- Deliberately NULL rather than a category — it may become 'ai' or 'human'
    -- on a later UPDATE, which the update trigger below allows exactly once.
    else null
  end;
$$;

create or replace function public.chat_history_stamp_handled_by()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- An explicitly supplied value always wins: if the n8n workflows are ever
  -- changed to state handled_by directly, this trigger steps aside.
  if new.handled_by is null then
    new.handled_by := public.chat_history_derive_handled_by(
      new.human_reply, new."Ai Reply", new."Sender Message"
    );
  end if;
  return new;
end;
$$;

create or replace function public.chat_history_freeze_handled_by()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.handled_by is not null then
    -- Frozen. Note this does NOT block updates to other columns: an UPDATE
    -- that leaves handled_by alone carries the old value forward unchanged, so
    -- `is distinct from` is false and nothing is raised. Only an actual
    -- rewrite of a stamped value is refused.
    if new.handled_by is distinct from old.handled_by then
      raise exception
        'handled_by is immutable once set (Chat History id %, % -> %)',
        old.id, old.handled_by, new.handled_by;
    end if;
  else
    -- Still unstamped: this is the one chance to record handling, e.g. an
    -- inbound guest row that later receives its reply by UPDATE.
    new.handled_by := public.chat_history_derive_handled_by(
      new.human_reply, new."Ai Reply", new."Sender Message"
    );
  end if;
  return new;
end;
$$;

drop trigger if exists chat_history_stamp_handled_by on public."Chat History";
create trigger chat_history_stamp_handled_by
  before insert on public."Chat History"
  for each row execute function public.chat_history_stamp_handled_by();

drop trigger if exists chat_history_freeze_handled_by on public."Chat History";
create trigger chat_history_freeze_handled_by
  before update on public."Chat History"
  for each row execute function public.chat_history_freeze_handled_by();

-- The Sera tool counts by handled_by within a date window, and the coverage
-- check needs a cheap "any NULLs in this window?" answer.
create index if not exists chat_history_handled_by_idx
  on public."Chat History" (handled_by);
