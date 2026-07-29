import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.2';
import { buildDateRange } from './training-aggregator.ts';
import { aggregateWhatsApp, phoneDigits } from './whatsapp-aggregator.ts';
import { classifyEmptyResult, emptyResultPayload } from './access-probe.ts';
import { fetchAllWithCap } from './paged-fetch.ts';

export const WHATSAPP_TOOL_NAME = 'query_whatsapp_chats';
const ROW_CAP = 4000;
const UNAVAILABLE = JSON.stringify({ error: 'WhatsApp chat data is temporarily unavailable. Tell the user you could not access the chat records right now.' });

export class WhatsAppQueryService {
  private authHeader: string;
  constructor(authHeader?: string) { this.authHeader = authHeader ?? ''; }

  getAvailableFunctions() {
    return [{
      name: WHATSAPP_TOOL_NAME,
      description: "Query guest WhatsApp conversations (the dashboard's Chat History table). Returns EXACT computed statistics: total messages, unique guests, human vs AI handled, per-day breakdown, and optional message samples. ALWAYS use this tool for ANY question about WhatsApp messages, guest chats, conversations, or senders. Never estimate chat numbers yourself.",
      parameters: {
        type: 'object',
        properties: {
          date_from: { type: 'string', description: 'Start date (inclusive), YYYY-MM-DD, Dubai time. Omit for no lower bound.' },
          date_to: { type: 'string', description: 'End date (inclusive), YYYY-MM-DD, Dubai time. Omit for no upper bound.' },
          phone_number: { type: 'string', description: 'Filter to one guest phone number (digits, partial match allowed).' },
          detail: { type: 'string', enum: ['summary', 'messages'], description: 'summary (default): totals only. messages: also include up to 30 recent message excerpts.' },
        },
        required: [],
      },
    }];
  }

  async executeFunction(functionName: string, args: any): Promise<string> {
    if (functionName !== WHATSAPP_TOOL_NAME) return JSON.stringify({ error: `Unknown function: ${functionName}` });
    try {
      const range = buildDateRange(args?.date_from, args?.date_to);
      if (range.error) return JSON.stringify({ error: range.error });
      const phoneDigest = phoneDigits(args?.phone_number);
      if (args?.phone_number && !phoneDigest) {
        return JSON.stringify({
          status: 'invalid_phone_number',
          instruction_to_model: "The phone_number filter must contain digits. Ask the user for the guest's phone number — names cannot be used to filter WhatsApp chats.",
        });
      }
      const supabase = createClient(
        Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_ANON_KEY') ?? '',
        { global: { headers: { Authorization: this.authHeader } } },
      );
      const { rows: data, exactCount, error } = await fetchAllWithCap<any>((from, to, withCount) => {
        let q = supabase.from('Chat History')
          .select('created_at,"Sender Number",Name,"Sender Message","Ai Reply",human_reply,is_human_controlled', withCount ? { count: 'exact' } : {})
          .order('created_at', { ascending: false })
          .order('id', { ascending: false })
          .range(from, to);
        if (range.fromISO) q = q.gte('created_at', range.fromISO);
        if (range.toExclusiveISO) q = q.lt('created_at', range.toExclusiveISO);
        if (phoneDigest) q = q.ilike('Sender Number', `%${phoneDigest}%`);
        return q;
      }, ROW_CAP);
      if (error) { console.error('❌ query_whatsapp_chats failed:', error); return UNAVAILABLE; }
      if (!data?.length) {
        const kind = await classifyEmptyResult('Chat History', (probe: any) => {
          if (range.fromISO) probe = probe.gte('created_at', range.fromISO);
          if (range.toExclusiveISO) probe = probe.lt('created_at', range.toExclusiveISO);
          if (phoneDigest) probe = probe.ilike('Sender Number', `%${phoneDigest}%`);
          return probe;
        });
        return emptyResultPayload(kind, { date_from: args?.date_from ?? null, date_to: args?.date_to ?? null });
      }
      const summary = aggregateWhatsApp(data.map((r: any) => ({
        created_at: r.created_at, sender: r['Sender Number'] ?? 'unknown', name: r.Name ?? null, humanControlled: !!r.is_human_controlled,
      })));
      const result: any = {
        status: 'ok',
        filters: { date_from: args?.date_from ?? null, date_to: args?.date_to ?? null, phone_number: args?.phone_number ?? null },
        ...summary,
        total_messages: exactCount ?? summary.total_messages,
      };
      const truncated = exactCount !== null ? exactCount > data.length : data.length >= ROW_CAP;
      if (truncated) {
        result.truncation_note = exactCount !== null
          ? `total_messages is exact; unique_guests and per-day/handling breakdowns cover only the ${data.length} most recent of ${exactCount} messages in range. Ask the user to narrow the date range for exact breakdowns.`
          : `Row cap of ${ROW_CAP} reached; totals cover only the ${ROW_CAP} most recent messages in range.`;
      }
      if (args?.detail === 'messages') {
        result.messages = data.slice(0, 30).map((r: any) => ({
          at: r.created_at, from: r['Sender Number'], name: r.Name,
          guest: (r['Sender Message'] ?? '').slice(0, 200), reply: ((r.human_reply ?? r['Ai Reply']) ?? '').slice(0, 200),
        }));
      }
      return JSON.stringify(result);
    } catch (e) { console.error('❌ query_whatsapp_chats crashed:', e); return UNAVAILABLE; }
  }
}
