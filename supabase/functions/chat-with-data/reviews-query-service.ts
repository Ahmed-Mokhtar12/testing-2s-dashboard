import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.2';
import { buildDateRange } from './training-aggregator.ts';
import { aggregateReviews } from './reviews-aggregator.ts';
import { classifyEmptyResult, emptyResultPayload } from './access-probe.ts';

export const REVIEWS_TOOL_NAME = 'query_reviews';
const ROW_CAP = 5000;
const UNAVAILABLE = JSON.stringify({ error: 'Reviews data is temporarily unavailable. Tell the user you could not access the review records right now.' });

export class ReviewsQueryService {
  private authHeader: string;
  constructor(authHeader?: string) { this.authHeader = authHeader ?? ''; }

  getAvailableFunctions() {
    return [{
      name: REVIEWS_TOOL_NAME,
      description: "Query guest reviews (the dashboard's reviews table). Returns EXACT counts and averages: total reviews, average score, per-source and per-month breakdowns, optional review excerpts. ALWAYS use this tool for ANY question about reviews, ratings, scores, or guest feedback. Never estimate review numbers yourself.",
      parameters: {
        type: 'object',
        properties: {
          date_from: { type: 'string', description: 'Start date (inclusive), YYYY-MM-DD. Omit for no lower bound.' },
          date_to: { type: 'string', description: 'End date (inclusive), YYYY-MM-DD. Omit for no upper bound.' },
          source: { type: 'string', description: "Review source, partial match allowed (e.g. 'Google', 'Booking.com')." },
          min_score: { type: 'number', description: 'Minimum score (inclusive).' },
          max_score: { type: 'number', description: 'Maximum score (inclusive).' },
          detail: { type: 'string', enum: ['summary', 'reviews'], description: 'summary (default): totals only. reviews: also include up to 20 recent review excerpts.' },
        },
        required: [],
      },
    }];
  }

  async executeFunction(functionName: string, args: any): Promise<string> {
    if (functionName !== REVIEWS_TOOL_NAME) return JSON.stringify({ error: `Unknown function: ${functionName}` });
    try {
      // 'Date' is a plain YYYY-MM-DD date-typed column (not a timestamp), so
      // we filter on date keys directly rather than the ISO bounds this
      // helper builds. buildDateRange is reused purely to validate format and
      // to detect a reversed range (via its `swapped` flag); when swapped, we
      // reorder the original date-key strings for the actual filter.
      const range = buildDateRange(args?.date_from, args?.date_to);
      if (range.error) return JSON.stringify({ error: range.error });
      const dateFrom = range.swapped ? (args?.date_to ?? null) : (args?.date_from ?? null);
      const dateTo = range.swapped ? (args?.date_from ?? null) : (args?.date_to ?? null);
      const supabase = createClient(
        Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_ANON_KEY') ?? '',
        { global: { headers: { Authorization: this.authHeader } } },
      );
      let q = supabase.from('Two Seasons and Reviews')
        .select('"Date",Source,Score,Author,Title,Text,"Hotel Name"')
        .order('Date', { ascending: false }).limit(ROW_CAP);
      if (dateFrom) q = q.gte('Date', dateFrom);
      if (dateTo) q = q.lte('Date', dateTo);
      if (args?.source) q = q.ilike('Source', `%${args.source}%`);
      if (typeof args?.min_score === 'number') q = q.gte('Score', args.min_score);
      if (typeof args?.max_score === 'number') q = q.lte('Score', args.max_score);
      const { data, error } = await q;
      if (error) { console.error('❌ query_reviews failed:', error); return UNAVAILABLE; }
      if (!data?.length) {
        const kind = await classifyEmptyResult('Two Seasons and Reviews', (probe: any) => {
          if (dateFrom) probe = probe.gte('Date', dateFrom);
          if (dateTo) probe = probe.lte('Date', dateTo);
          if (args?.source) probe = probe.ilike('Source', `%${args.source}%`);
          if (typeof args?.min_score === 'number') probe = probe.gte('Score', args.min_score);
          if (typeof args?.max_score === 'number') probe = probe.lte('Score', args.max_score);
          return probe;
        });
        return emptyResultPayload(kind, {
          date_from: args?.date_from ?? null, date_to: args?.date_to ?? null,
          ...(kind === 'no_records_found' ? { ingestion_note: 'Newest review in the database is dated 2026-05-18 — review ingestion has been stale since then; mention this if the user asked about recent reviews.' } : {}),
        });
      }
      const summary = aggregateReviews(data.map((r: any) => ({
        date: r.Date, source: r.Source ?? null, score: r.Score === null ? null : Number(r.Score), hotel: r['Hotel Name'] ?? null,
      })));
      const result: any = {
        status: 'ok',
        filters: { date_from: args?.date_from ?? null, date_to: args?.date_to ?? null, source: args?.source ?? null, min_score: args?.min_score ?? null, max_score: args?.max_score ?? null },
        ...summary,
      };
      if (data.length === ROW_CAP) result.truncation_note = `Row cap of ${ROW_CAP} reached; totals cover only the ${ROW_CAP} most recent reviews in range.`;
      if (range.swapped) result.note = 'date_from and date_to were reversed and have been swapped.';
      if (args?.detail === 'reviews') {
        result.reviews = data.slice(0, 20).map((r: any) => ({
          date: r.Date, source: r.Source, score: r.Score === null ? null : Number(r.Score), author: r.Author, title: r.Title,
          text: (r.Text ?? '').slice(0, 200),
        }));
      }
      return JSON.stringify(result);
    } catch (e) { console.error('❌ query_reviews crashed:', e); return UNAVAILABLE; }
  }
}
