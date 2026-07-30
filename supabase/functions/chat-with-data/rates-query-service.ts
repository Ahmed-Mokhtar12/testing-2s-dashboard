import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.2';
import { buildDateRange } from './training-aggregator.ts';
import { aggregateRates } from './rates-aggregator.ts';
import { classifyEmptyResult, emptyResultPayload } from './access-probe.ts';
import { fetchAllWithCap } from './paged-fetch.ts';

export const RATES_TOOL_NAME = 'query_competitor_rates';
const TABLE = 'Two Seasons Competitor Hotel room Rates';
const ROW_CAP = 5000;
const UNAVAILABLE = JSON.stringify({ error: 'Competitor rate data is temporarily unavailable. Tell the user you could not access the competitor rate records right now.' });

export class RatesQueryService {
  private authHeader: string;
  constructor(authHeader?: string) { this.authHeader = authHeader ?? ''; }

  getAvailableFunctions() {
    return [{
      name: RATES_TOOL_NAME,
      description: "Query competitor hotel room rates collected by the dashboard. Returns EXACT numbers: per-hotel min/average AED, cheapest hotel per day, days covered. ALWAYS use this tool for ANY question about competitor prices, room rates, or price positioning. Never estimate rates yourself.",
      parameters: {
        type: 'object',
        properties: {
          date_from: { type: 'string', description: 'Start date (inclusive), YYYY-MM-DD. Omit for no lower bound.' },
          date_to: { type: 'string', description: 'End date (inclusive), YYYY-MM-DD. Omit for no upper bound.' },
          hotel_name: { type: 'string', description: 'Filter to one competitor hotel, partial match allowed.' },
          detail: { type: 'string', enum: ['summary', 'quotes'], description: 'summary (default): totals only. quotes: also include up to 30 recent rate quotes.' },
        },
        required: [],
      },
    }];
  }

  async executeFunction(functionName: string, args: any): Promise<string> {
    if (functionName !== RATES_TOOL_NAME) return JSON.stringify({ error: `Unknown function: ${functionName}` });
    try {
      // 'report_date' is a plain YYYY-MM-DD date-typed column (not a
      // timestamp), so we filter on date keys directly rather than the ISO
      // bounds this helper builds. buildDateRange is reused purely to
      // validate format and to detect a reversed range (via its `swapped`
      // flag); when swapped, we reorder the original date-key strings for
      // the actual filter.
      const range = buildDateRange(args?.date_from, args?.date_to);
      if (range.error) return JSON.stringify({ error: range.error });
      const dateFrom = range.swapped ? (args?.date_to ?? null) : (args?.date_from ?? null);
      const dateTo = range.swapped ? (args?.date_from ?? null) : (args?.date_to ?? null);
      const supabase = createClient(
        Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_ANON_KEY') ?? '',
        { global: { headers: { Authorization: this.authHeader } } },
      );
      const { rows: data, exactCount, error } = await fetchAllWithCap<any>((from, to, withCount) => {
        let q = supabase.from(TABLE)
          .select('report_date,hotel_name,checkin_date,converted_price_aed,status,is_lowest_for_day', withCount ? { count: 'exact' } : {})
          .eq('dry_run', false).in('status', ['success', 'price_found'])
          .order('report_date', { ascending: false })
          .order('id', { ascending: false })
          .range(from, to);
        if (dateFrom) q = q.gte('report_date', dateFrom);
        if (dateTo) q = q.lte('report_date', dateTo);
        if (args?.hotel_name) q = q.ilike('hotel_name', `%${args.hotel_name}%`);
        return q;
      }, ROW_CAP);
      if (error) { console.error('❌ query_competitor_rates failed:', error); return UNAVAILABLE; }
      if (!data?.length) {
        const kind = await classifyEmptyResult(TABLE, (probe: any) => {
          probe = probe.eq('dry_run', false).in('status', ['success', 'price_found']);
          if (dateFrom) probe = probe.gte('report_date', dateFrom);
          if (dateTo) probe = probe.lte('report_date', dateTo);
          if (args?.hotel_name) probe = probe.ilike('hotel_name', `%${args.hotel_name}%`);
          return probe;
        });
        return emptyResultPayload(kind, { date_from: args?.date_from ?? null, date_to: args?.date_to ?? null });
      }
      const summary = aggregateRates(data.map((r: any) => ({
        report_date: r.report_date, hotel: r.hotel_name,
        price_aed: r.converted_price_aed === null ? null : Number(r.converted_price_aed),
      })));
      const result: any = {
        status: 'ok',
        filters: { date_from: args?.date_from ?? null, date_to: args?.date_to ?? null, hotel_name: args?.hotel_name ?? null },
        ...summary,
      };
      const truncated = exactCount !== null ? exactCount > data.length : data.length >= ROW_CAP;
      if (truncated) {
        result.truncation_note = exactCount !== null
          ? `The rate statistics are computed from only the ${data.length} most recent of ${exactCount} rate records in range. You MUST tell the user the statistics cover a subset (${data.length} of ${exactCount} records), and suggest narrowing the date range for exact statistics.`
          : `Row cap of ${ROW_CAP} reached. You MUST tell the user that all figures cover only the ${ROW_CAP} most recent rate records in range, and suggest narrowing the date range.`;
      }
      if (range.swapped) result.note = 'date_from and date_to were reversed and have been swapped.';
      if (args?.detail === 'quotes') {
        result.quotes = data.slice(0, 30).map((r: any) => ({
          report_date: r.report_date, hotel_name: r.hotel_name, checkin_date: r.checkin_date,
          converted_price_aed: r.converted_price_aed === null ? null : Number(r.converted_price_aed),
        }));
      }
      return JSON.stringify(result);
    } catch (e) { console.error('❌ query_competitor_rates crashed:', e); return UNAVAILABLE; }
  }
}
