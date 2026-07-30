import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useDateRange } from '@/contexts/useDateRange';
import { dailySeriesByDateKey, countBy, safeNum, fetchAllRows } from './utils';

const QUERY_STALE_TIME = 5 * 60 * 1000;
const QUERY_GC_TIME = 10 * 60 * 1000;

export function useReviewsInsights() {
  const { fromDateKey, toDateKey } = useDateRange();

  return useQuery({
    queryKey: ['insights', 'reviews', fromDateKey, toDateKey],
    staleTime: QUERY_STALE_TIME,
    gcTime: QUERY_GC_TIME,
    queryFn: async () => {
      const rows = await fetchAllRows((from, to) =>
        supabase
          .from('Two Seasons and Reviews')
          .select('id, Date, Source, Score, Text, "Hotel Name", Author')
          .gte('Date', fromDateKey)
          .lte('Date', toDateKey)
          .order('Date', { ascending: false })
          .order('id', { ascending: false })
          .range(from, to)
      );

      const stats = rows.reduce(
        (acc, row) => {
          const score = safeNum(row.Score);
          if (score > 0) {
            acc.scoreSum += score;
            acc.scoreCount += 1;
            if (score >= 4) acc.positive += 1;
            if (score <= 2.5) acc.negative += 1;
            if (score < 1.5) acc.distribution[0].value += 1;
            else if (score < 2.5) acc.distribution[1].value += 1;
            else if (score < 3.5) acc.distribution[2].value += 1;
            else if (score < 4.5) acc.distribution[3].value += 1;
            else acc.distribution[4].value += 1;
          }
          return acc;
        },
        {
          scoreSum: 0,
          scoreCount: 0,
          positive: 0,
          negative: 0,
          distribution: [
            { name: '0–1', value: 0 },
            { name: '1.5–2.5', value: 0 },
            { name: '2.5–3.5', value: 0 },
            { name: '3.5–4.5', value: 0 },
            { name: '4.5–5', value: 0 },
          ],
        }
      );

      const trend = dailySeriesByDateKey(fromDateKey, toDateKey, rows, (row) =>
        row.Date ? String(row.Date) : null
      );
      const sources = countBy(rows, (row) => row.Source as string);

      return {
        rows,
        kpis: {
          total: rows.length,
          avg: stats.scoreCount ? stats.scoreSum / stats.scoreCount : 0,
          positive: stats.positive,
          negative: stats.negative,
        },
        trend,
        sources,
        distribution: stats.distribution,
      };
    },
  });
}
