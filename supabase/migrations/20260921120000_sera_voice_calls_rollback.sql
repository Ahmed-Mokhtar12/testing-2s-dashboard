-- Rollback for 20260921120000_sera_voice_calls.sql
--
-- COST OF ROLLING BACK: the archive copy of every Sera voice call (calls, turns, tool
-- events, raw payloads) is lost; ElevenLabs still holds the last 30 days, anything
-- older is gone for good. The dashboard's Sera Voice page and the "Sera Voice - Call
-- Archive" n8n workflow both break until the migration is re-applied (a re-applied
-- migration + a 30-day backfill run restores at most the last 30 days).

drop view if exists public.sera_voice_calls_v;
drop table if exists public.sera_voice_call_payloads cascade;
drop table if exists public.sera_voice_call_tool_events cascade;
drop table if exists public.sera_voice_call_turns cascade;
drop table if exists public.sera_voice_calls cascade;
drop function if exists public.sera_voice_calls_set_dates();
