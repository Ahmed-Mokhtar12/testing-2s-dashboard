import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useDateRange } from '@/contexts/DateRangeContext';
import { dailySeriesByDateKey, countBy } from './utils';

export function useWelcomeInsights() {
  const { fromDateKey, toDateKey } = useDateRange();

  return useQuery({
    queryKey: ['insights', 'welcome', fromDateKey, toDateKey],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('welcome_message_success_log')
        .select('id, sent_date, sent_at, mobile_number, guest_id, full_name, arrival_date, status')
        .gte('sent_date', fromDateKey)
        .lte('sent_date', toDateKey)
        .order('sent_at', { ascending: false })
        .limit(10000);
      if (error) throw error;
      const rows = data || [];

      const sent = rows.length;
      const successful = rows.filter((r) => (r.status || '').toLowerCase() === 'sent').length;
      const arrivals = new Set(
        rows.map((r) => `${r.arrival_date || ''}|${r.guest_id || r.mobile_number || ''}`)
      ).size;
      const uniqueGuests = new Set(rows.map((r) => r.guest_id || r.mobile_number).filter(Boolean)).size;
      const successRate = sent ? Math.round((successful / sent) * 100) : 0;

      const trend = dailySeriesByDateKey(fromDateKey, toDateKey, rows, (r) =>
        r.sent_date ? String(r.sent_date) : null
      );
      const statusSplit = countBy(rows, (r) => r.status as string);

      return { rows, kpis: { arrivals, sent, successful, uniqueGuests, successRate }, trend, statusSplit };
    },
  });
}
