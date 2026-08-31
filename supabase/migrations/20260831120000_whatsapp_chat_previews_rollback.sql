-- Rollback for 20260831120000_whatsapp_chat_previews.sql
--
-- COST OF ROLLING BACK: the frontend commits that call whatsapp_chat_previews
-- (Phase-1 item A3b and the Phase-2 unread rendering) must be reverted FIRST
-- or the sidebar errors on a missing RPC. After both, the sidebar reverts to
-- the clamped full-table select — only conversations present in the newest
-- 1,000 rows visible (182 of 3,983 as measured 2026-08-31) — and every
-- operator's read watermark is PERMANENTLY LOST (dropping the table deletes
-- the data; unread badges restart from "everything unread" if re-applied).
-- Dropping the index also re-slows the per-thread history query. Nothing in
-- n8n consumes any of these objects.

DROP FUNCTION IF EXISTS public.whatsapp_chat_previews(int, int);
DROP TABLE IF EXISTS public.whatsapp_read_state;
DROP INDEX IF EXISTS public.idx_chat_history_sender_created;
