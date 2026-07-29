import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.2';
import { buildDateRange } from './training-aggregator.ts';
import { aggregateEmails } from './emails-aggregator.ts';
import { classifyEmptyResult, emptyResultPayload } from './access-probe.ts';
import { fetchAllWithCap } from './paged-fetch.ts';

export const EMAILS_TOOL_NAME = 'query_sera_emails';
const ROW_CAP = 4000;
const UNAVAILABLE = JSON.stringify({ error: 'Guest email data is temporarily unavailable. Tell the user you could not access the email records right now.' });

export class EmailsQueryService {
  private authHeader: string;
  constructor(authHeader?: string) { this.authHeader = authHeader ?? ''; }

  getAvailableFunctions() {
    return [{
      name: EMAILS_TOOL_NAME,
      description: "Query Sera's guest email activity log (emails Sera sent/handled for guests). Returns EXACT counts: total emails, new vs reply, unique guests, per-category and per-day breakdowns, optional excerpts. ALWAYS use this tool for ANY question about guest emails Sera handled. Never estimate email numbers yourself.",
      parameters: {
        type: 'object',
        properties: {
          date_from: { type: 'string', description: 'Start date (inclusive), YYYY-MM-DD, Dubai time. Omit for no lower bound.' },
          date_to: { type: 'string', description: 'End date (inclusive), YYYY-MM-DD, Dubai time. Omit for no upper bound.' },
          email_type: { type: 'string', enum: ['new', 'reply'], description: 'Filter to new emails or replies only.' },
          category: { type: 'string', description: 'Filter by email category, partial match allowed.' },
          detail: { type: 'string', enum: ['summary', 'emails'], description: 'summary (default): totals only. emails: also include up to 20 recent email excerpts.' },
        },
        required: [],
      },
    }];
  }

  async executeFunction(functionName: string, args: any): Promise<string> {
    if (functionName !== EMAILS_TOOL_NAME) return JSON.stringify({ error: `Unknown function: ${functionName}` });
    try {
      const range = buildDateRange(args?.date_from, args?.date_to);
      if (range.error) return JSON.stringify({ error: range.error });
      const supabase = createClient(
        Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_ANON_KEY') ?? '',
        { global: { headers: { Authorization: this.authHeader } } },
      );
      const { rows: data, exactCount, error } = await fetchAllWithCap<any>((from, to, withCount) => {
        let q = supabase.from('2Seasons_Sera_Email_Log')
          .select('sent_at,email_type,category,nature_of_request,guest_name,guest_email,email_subject', withCount ? { count: 'exact' } : {})
          .order('sent_at', { ascending: false })
          .order('id', { ascending: false })
          .range(from, to);
        if (range.fromISO) q = q.gte('sent_at', range.fromISO);
        if (range.toExclusiveISO) q = q.lt('sent_at', range.toExclusiveISO);
        if (args?.email_type) q = q.eq('email_type', args.email_type);
        if (args?.category) q = q.ilike('category', `%${args.category}%`);
        return q;
      }, ROW_CAP);
      if (error) { console.error('❌ query_sera_emails failed:', error); return UNAVAILABLE; }
      if (!data?.length) {
        const kind = await classifyEmptyResult('2Seasons_Sera_Email_Log', (probe: any) => {
          if (range.fromISO) probe = probe.gte('sent_at', range.fromISO);
          if (range.toExclusiveISO) probe = probe.lt('sent_at', range.toExclusiveISO);
          if (args?.email_type) probe = probe.eq('email_type', args.email_type);
          if (args?.category) probe = probe.ilike('category', `%${args.category}%`);
          return probe;
        });
        return emptyResultPayload(kind, { date_from: args?.date_from ?? null, date_to: args?.date_to ?? null });
      }
      const summary = aggregateEmails(data.map((r: any) => ({
        sent_at: r.sent_at, email_type: r.email_type ?? null, category: r.category ?? null, guest_email: r.guest_email ?? null,
      })));
      const result: any = {
        status: 'ok',
        filters: { date_from: args?.date_from ?? null, date_to: args?.date_to ?? null, email_type: args?.email_type ?? null, category: args?.category ?? null },
        ...summary,
        total_emails: exactCount ?? summary.total_emails,
      };
      const truncated = exactCount !== null ? exactCount > data.length : data.length >= ROW_CAP;
      if (truncated) {
        result.truncation_note = exactCount !== null
          ? `total_emails is exact; new/reply splits, unique_guests and breakdowns cover only the ${data.length} most recent of ${exactCount} emails in range. Ask the user to narrow the date range for exact breakdowns.`
          : `Row cap of ${ROW_CAP} reached; totals cover only the ${ROW_CAP} most recent emails in range.`;
      }
      if (args?.detail === 'emails') {
        result.emails = data.slice(0, 20).map((r: any) => ({
          sent_at: r.sent_at, email_type: r.email_type, category: r.category, guest_name: r.guest_name,
          subject: (r.email_subject ?? '').slice(0, 120),
        }));
      }
      return JSON.stringify(result);
    } catch (e) { console.error('❌ query_sera_emails crashed:', e); return UNAVAILABLE; }
  }
}
