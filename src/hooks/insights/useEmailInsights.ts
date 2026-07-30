import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useDateRange } from '@/contexts/useDateRange';
import { dailySeries, countBy, fetchAllRows } from './utils';

const QUERY_STALE_TIME = 5 * 60 * 1000;
const QUERY_GC_TIME = 10 * 60 * 1000;

export function useEmailInsights() {
  const { from, to, fromISO, toISO } = useDateRange();

  return useQuery({
    queryKey: ['insights', 'sera-email', fromISO, toISO],
    staleTime: QUERY_STALE_TIME,
    gcTime: QUERY_GC_TIME,
    queryFn: async () => {
      const rows = await fetchAllRows((from, to) =>
        supabase
          .from('2Seasons_Sera_Email_Log')
          .select('id, sent_at, email_type, category, nature_of_request, guest_name, guest_email, email_subject')
          .gte('sent_at', fromISO)
          .lte('sent_at', toISO)
          .order('sent_at', { ascending: false })
          .order('id', { ascending: false })
          .range(from, to)
      );

      const newEmails = rows.filter((r) => r.email_type === 'new').length;
      const replyEmails = rows.filter((r) => r.email_type === 'reply').length;
      const uniqueGuests = new Set(rows.map((r) => r.guest_email).filter(Boolean)).size;

      const newRows = rows.filter((r) => r.email_type === 'new');
      const replyRows = rows.filter((r) => r.email_type === 'reply');
      const newTrend = dailySeries(from, to, newRows, (r) => (r.sent_at ? new Date(r.sent_at) : null));
      const replyTrend = dailySeries(from, to, replyRows, (r) => (r.sent_at ? new Date(r.sent_at) : null));
      const trend = newTrend.map((row, i) => ({
        label: row.label,
        new: row.value,
        reply: replyTrend[i]?.value ?? 0,
      }));

      const categoryBreakdown = countBy(rows, (r) => r.category as string).slice(0, 8);
      const natureBreakdown = countBy(rows, (r) => r.nature_of_request as string).slice(0, 8);
      const newVsReply = [
        { name: 'New', value: newEmails },
        { name: 'Reply', value: replyEmails },
      ];

      return {
        kpis: { total: rows.length, newEmails, replyEmails, uniqueGuests },
        trend,
        categoryBreakdown,
        natureBreakdown,
        newVsReply,
        latestEmails: rows,
      };
    },
  });
}
