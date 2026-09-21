import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Database, Json } from '@/integrations/supabase/types';

type TurnRow = Database['public']['Tables']['sera_voice_call_turns']['Row'];
type ToolEventRow = Database['public']['Tables']['sera_voice_call_tool_events']['Row'];

export type SeraVoiceTurn = Pick<
  TurnRow,
  'conversation_id' | 'turn_index' | 'role' | 'message' | 'time_in_call_secs' | 'interrupted' | 'tool_calls' | 'tool_results'
>;

export type SeraVoiceToolEvent = Pick<
  ToolEventRow,
  'turn_index' | 'event_index' | 'tool_name' | 'params' | 'result_status' | 'result_excerpt' | 'is_error' | 'latency_secs'
>;

export interface SeraVoiceCallDetail {
  turns: SeraVoiceTurn[];
  toolEvents: SeraVoiceToolEvent[];
}

/** One entry of a turn's `tool_calls` jsonb array (shape per SCHEMA.md). */
export interface SeraVoiceToolCall {
  tool_name: string;
  params?: Record<string, unknown>;
  request_id?: string;
}

/** One entry of a turn's `tool_results` jsonb array (shape per SCHEMA.md). */
export interface SeraVoiceToolResult {
  tool_name: string;
  is_error: boolean;
  latency_secs?: number;
  result_status?: string;
  result_excerpt?: string;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

const asString = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);

const asNumber = (v: unknown): number | undefined => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
};

/** Null-safe parse of a turn's `tool_calls` jsonb; malformed entries are dropped. */
export function parseToolCalls(json: Json | null | undefined): SeraVoiceToolCall[] {
  if (!Array.isArray(json)) return [];
  const out: SeraVoiceToolCall[] = [];
  for (const entry of json) {
    if (!isRecord(entry)) continue;
    const tool_name = asString(entry.tool_name)?.trim();
    if (!tool_name) continue;
    const call: SeraVoiceToolCall = { tool_name };
    if (isRecord(entry.params)) call.params = entry.params;
    const request_id = asString(entry.request_id);
    if (request_id) call.request_id = request_id;
    out.push(call);
  }
  return out;
}

/** Null-safe parse of a turn's `tool_results` jsonb; malformed entries are dropped. */
export function parseToolResults(json: Json | null | undefined): SeraVoiceToolResult[] {
  if (!Array.isArray(json)) return [];
  const out: SeraVoiceToolResult[] = [];
  for (const entry of json) {
    if (!isRecord(entry)) continue;
    const tool_name = asString(entry.tool_name)?.trim();
    if (!tool_name) continue;
    const result: SeraVoiceToolResult = { tool_name, is_error: entry.is_error === true };
    const latency = asNumber(entry.latency_secs);
    if (latency !== undefined) result.latency_secs = latency;
    const status = asString(entry.result_status);
    if (status) result.result_status = status;
    const excerpt = asString(entry.result_excerpt);
    if (excerpt !== undefined) result.result_excerpt = excerpt;
    out.push(result);
  }
  return out;
}

/**
 * Transcript + tool events for one ElevenLabs conversation. Disabled until an id is chosen;
 * both tables are read in one queryFn so the sheet renders atomically.
 */
export function useSeraVoiceCall(conversationId: string | null) {
  return useQuery<SeraVoiceCallDetail>({
    queryKey: ['sera-voice', 'call', conversationId],
    enabled: !!conversationId,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    queryFn: async () => {
      const id = conversationId ?? '';
      const [turnsRes, eventsRes] = await Promise.all([
        supabase
          .from('sera_voice_call_turns')
          .select('conversation_id, turn_index, role, message, time_in_call_secs, interrupted, tool_calls, tool_results')
          .eq('conversation_id', id)
          .order('turn_index', { ascending: true }),
        supabase
          .from('sera_voice_call_tool_events')
          .select('turn_index, event_index, tool_name, params, result_status, result_excerpt, is_error, latency_secs')
          .eq('conversation_id', id)
          .order('turn_index', { ascending: true })
          .order('event_index', { ascending: true }),
      ]);
      if (turnsRes.error) throw turnsRes.error;
      if (eventsRes.error) throw eventsRes.error;
      return {
        turns: turnsRes.data ?? [],
        toolEvents: eventsRes.data ?? [],
      };
    },
  });
}
