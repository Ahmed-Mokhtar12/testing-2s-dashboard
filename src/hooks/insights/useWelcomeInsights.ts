import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useDateRange } from '@/contexts/useDateRange';
import { dailySeriesByDateKey, countBy, fetchAllRows } from './utils';

const QUERY_STALE_TIME = 5 * 60 * 1000;
const QUERY_GC_TIME = 10 * 60 * 1000;

export function useWelcomeInsights() {
  const { fromDateKey, toDateKey } = useDateRange();

  return useQuery({
    queryKey: ['insights', 'welcome', fromDateKey, toDateKey],
    staleTime: QUERY_STALE_TIME,
    gcTime: QUERY_GC_TIME,
    queryFn: async () => {
      const rows = await fetchAllRows((from, to) =>
        supabase
          .from('welcome_message_success_log')
          .select('id, sent_date, sent_at, mobile_number, guest_id, full_name, arrival_date, status')
          .gte('sent_date', fromDateKey)
          .lte('sent_date', toDateKey)
          .order('sent_at', { ascending: false })
          .order('id', { ascending: false })
          .range(from, to)
      );

      const stats = rows.reduce(
        (acc, row) => {
          if ((row.status || '').toLowerCase() === 'sent') acc.successful += 1;
          acc.arrivals.add(`${row.arrival_date || ''}|${row.guest_id || row.mobile_number || ''}`);
          const guestKey = row.guest_id || row.mobile_number;
          if (guestKey) acc.uniqueGuests.add(String(guestKey));
          return acc;
        },
        {
          successful: 0,
          arrivals: new Set<string>(),
          uniqueGuests: new Set<string>(),
        }
      );

      const trend = dailySeriesByDateKey(fromDateKey, toDateKey, rows, (row) =>
        row.sent_date ? String(row.sent_date) : null
      );
      const statusSplit = countBy(rows, (row) => row.status as string);

      return {
        rows,
        kpis: {
          arrivals: stats.arrivals.size,
          sent: rows.length,
          successful: stats.successful,
          uniqueGuests: stats.uniqueGuests.size,
          successRate: rows.length ? Math.round((stats.successful / rows.length) * 100) : 0,
        },
        trend,
        statusSplit,
      };
    },
  });
}
