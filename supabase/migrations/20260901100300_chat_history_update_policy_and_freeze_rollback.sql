-- Rollback for 20260901100300_chat_history_update_policy_and_freeze.sql
--
-- COST OF ROLLING BACK: any staff JWT can again rewrite every column of any guest row
-- through PostgREST, and a takeover/release again back-stamps a sender's whole unstamped
-- history with derived handled_by values (so Sera's coverage check drops its caveat for rows
-- that were never stamped at handling time).

create policy "Hotel staff can update Chat History"
on public."Chat History"
for update to authenticated
using (public.is_hotel_staff(auth.uid()))
with check (
  public.is_hotel_staff(auth.uid())
  and (replied_by_user_id is null or replied_by_user_id = auth.uid())
);

-- Function body as of 20260731200000_chat_history_handled_by.sql
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
  else
    new.handled_by := public.chat_history_derive_handled_by(
      new.human_reply, new."Ai Reply", new."Sender Message"
    );
  end if;
  return new;
end;
$$;
