-- Rollback for 20260831120000_whatsapp_chat_previews.sql
--
-- COST OF ROLLING BACK: the frontend commit that calls whatsapp_chat_previews
-- (Phase-1 item A3b) must be reverted FIRST or the sidebar errors on a missing
-- RPC. After both, the sidebar reverts to the clamped full-table select — only
-- conversations present in the newest 1,000 rows visible (182 of 3,983 as
-- measured 2026-08-31). Dropping the index also re-slows the per-thread
-- history query (it removes the Sender Number filter waste). Nothing else
-- consumes the function or the index.

DROP FUNCTION IF EXISTS public.whatsapp_chat_previews(int, int);
DROP INDEX IF EXISTS public.idx_chat_history_sender_created;
