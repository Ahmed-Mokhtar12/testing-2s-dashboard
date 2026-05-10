import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useDateRange } from '@/contexts/useDateRange';
import { countBy } from './utils';

const QUERY_STALE_TIME = 5 * 60 * 1000;
const QUERY_GC_TIME = 10 * 60 * 1000;

function natureFromText(text: string | null | undefined): string {
  const value = (text || '').toLowerCase();
  if (!value) return 'Other';
  if (value.includes('banquet') || value.includes('event') || value.includes('wedding')) return 'Banquet/Event';
  if (value.includes('book') || value.includes('reserv')) return 'Booking';
  if (value.includes('rate') || value.includes('price')) return 'Pricing';
  if (value.includes('complaint') || value.includes('issue')) return 'Complaint';
  if (value.includes('inquir') || value.includes('question') || value.includes('?')) return 'Inquiry';
  return 'Other';
}

export function useSocialInsights() {
  const { fromISO, toISO } = useDateRange();

  return useQuery({
    queryKey: ['insights', 'social', fromISO, toISO],
    staleTime: QUERY_STALE_TIME,
    gcTime: QUERY_GC_TIME,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('social_engagement_logs')
        .select('id, platform, channel, event_type, status, notes, guest_message_text, created_at, escalation_flag')
        .gte('created_at', fromISO)
        .lte('created_at', toISO)
        .order('created_at', { ascending: false })
        .limit(1000);
      if (error) throw error;

      const rows = data || [];
      const stats = rows.reduce(
        (acc, row) => {
          const platform = `${row.platform || ''} ${row.channel || ''}`.toLowerCase();
          const isInstagram = platform.includes('insta');
          const isFacebook = platform.includes('facebook');
          const isComment = (row.event_type || '').toLowerCase().includes('comment');

          if (isInstagram && isComment) acc.igComments += 1;
          if (isInstagram && !isComment) acc.igDMs += 1;
          if (isFacebook && !isComment) acc.fbDMs += 1;
          if (isInstagram) acc.platformSplit[0].value += 1;
          else if (isFacebook) acc.platformSplit[1].value += 1;
          else acc.platformSplit[2].value += 1;

          return acc;
        },
        {
          igComments: 0,
          igDMs: 0,
          fbDMs: 0,
          platformSplit: [
            { name: 'Instagram', value: 0 },
            { name: 'Facebook', value: 0 },
            { name: 'Other', value: 0 },
          ],
        }
      );

      const eventSplit = countBy(rows, (row) => row.event_type as string);
      const natureSplit = countBy(rows, (row) => natureFromText(row.notes || row.guest_message_text || row.status));

      return {
        rows,
        kpis: {
          igComments: stats.igComments,
          totalDMs: stats.igDMs + stats.fbDMs,
          igDMs: stats.igDMs,
          fbDMs: stats.fbDMs,
        },
        platformSplit: stats.platformSplit.filter((item) => item.value > 0),
        eventSplit,
        natureSplit,
      };
    },
  });
}
