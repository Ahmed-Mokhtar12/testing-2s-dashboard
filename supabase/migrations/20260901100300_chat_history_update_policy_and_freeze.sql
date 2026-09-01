-- 20260901100300_chat_history_update_policy_and_freeze.sql
--
-- (1) Any staff JWT could PATCH every column of any guest row through PostgREST —
--     "Sender Message", "Ai Reply", Name, is_archived, is_human_controlled, and could set
--     replied_by_user_id to NULL (passes the WITH CHECK). No legitimate caller does this:
--     the dashboard never UPDATEs this table directly, whatsapp-send-message and
--     whatsapp-auto-release use the service role, n8n only inserts. Drop the policy.
-- (2) The freeze trigger stamped ANY unstamped row on ANY update, and takeover/release
--     update every row of a sender, so one takeover back-filled a guest's whole
--     pre-2026-07-31 history with derived handled_by values — and Sera's "any NULLs in
--     this window?" coverage check then dropped its caveat for data never stamped at
--     handling time (audit D6). Derive on update only when a content column changed.
--     The INSERT trigger (chat_history_stamp_handled_by) is untouched.

drop policy if exists "Hotel staff can update Chat History" on public."Chat History";

create or replace function public.chat_history_freeze_handled_by()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.handled_by is not null then
    if new.handled_by is distinct from old.handled_by then
      raise exception
        'handled_by is immutable once set (Chat History id %, % -> %)',
        old.id, old.handled_by, new.handled_by;
    end if;
  elsif (new.human_reply is distinct from old.human_reply)
     or (new."Ai Reply" is distinct from old."Ai Reply")
     or (new."Sender Message" is distinct from old."Sender Message") then
    -- Still unstamped AND the reply/message actually changed: this is handling happening
    -- now (e.g. an inbound guest row receiving its reply by UPDATE). A flag-only update
    -- (takeover, release, archive) leaves NULL alone — NULL means "predates the stamp",
    -- and that must stay true across a sender-wide is_human_controlled rewrite.
    new.handled_by := public.chat_history_derive_handled_by(
      new.human_reply, new."Ai Reply", new."Sender Message"
    );
  end if;
  return new;
end;
$$;

do $$
begin
  if exists (select 1 from pg_policies where tablename = 'Chat History' and policyname = 'Hotel staff can update Chat History') then
    raise exception 'update policy still present';
  end if;
end $$;
