import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useDateRange } from '@/contexts/DateRangeContext';
import { dailySeriesByDateKey, countBy, safeNum } from './utils';

export function useReviewsInsights() {
  const { fromDateKey, toDateKey } = useDateRange();

  return useQuery({
    queryKey: ['insights', 'reviews', fromDateKey, toDateKey],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('reviews')
        .select('id, Date, Source, Score, Text, "Hotel Name", Author')
        .gte('Date', fromDateKey)
        .lte('Date', toDateKey)
        .order('Date', { ascending: false })
        .limit(10000);
      if (error) throw error;
      const rows = data || [];

      const total = rows.length;
      const scores = rows.map((r) => safeNum(r.Score)).filter((n) => n > 0);
      const avg = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
      const positive = scores.filter((s) => s >= 4).length;
      const negative = scores.filter((s) => s <= 2.5).length;

      const trend = dailySeriesByDateKey(fromDateKey, toDateKey, rows, (r) =>
        r.Date ? String(r.Date) : null
      );
      const sources = countBy(rows, (r) => r.Source as string);
      const distribution = [
        { name: '0–1', value: scores.filter((s) => s < 1.5).length },
        { name: '1.5–2.5', value: scores.filter((s) => s >= 1.5 && s < 2.5).length },
        { name: '2.5–3.5', value: scores.filter((s) => s >= 2.5 && s < 3.5).length },
        { name: '3.5–4.5', value: scores.filter((s) => s >= 3.5 && s < 4.5).length },
        { name: '4.5–5', value: scores.filter((s) => s >= 4.5).length },
      ];

      return { rows, kpis: { total, avg, positive, negative }, trend, sources, distribution };
    },
  });
}
