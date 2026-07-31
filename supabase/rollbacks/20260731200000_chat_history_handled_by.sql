-- ROLLBACK for 20260731200000_chat_history_handled_by.sql. Apply via MCP/psql;
-- NOT a migration (this directory is not scanned by the CLI, so it never
-- replays on db reset).
--
-- Order matters: triggers before their functions, and the column last, because
-- the check constraint and index go with it.
--
-- NOTE: dropping the column DISCARDS every stamp collected since the migration
-- was applied. There is no way to recover them — the whole point of the column
-- is that the underlying signal (is_human_controlled) is retroactively
-- rewritten, so the stamps cannot be recomputed after the fact. If the goal is
-- only to stop stamping, drop the two triggers and leave the column in place.

drop trigger if exists chat_history_freeze_handled_by on public."Chat History";
drop trigger if exists chat_history_stamp_handled_by on public."Chat History";

drop function if exists public.chat_history_freeze_handled_by();
drop function if exists public.chat_history_stamp_handled_by();
drop function if exists public.chat_history_derive_handled_by(text, text, text);

drop index if exists public.chat_history_handled_by_idx;

alter table public."Chat History"
  drop constraint if exists chat_history_handled_by_check;

alter table public."Chat History"
  drop column if exists handled_by;
