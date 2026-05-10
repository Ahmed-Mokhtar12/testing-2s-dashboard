import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useDateRange } from '@/contexts/useDateRange';
import { dailySeries, countBy } from './utils';

const QUERY_STALE_TIME = 5 * 60 * 1000;
const QUERY_GC_TIME = 10 * 60 * 1000;

export function useWhatsAppInsights() {
  const { from, to, fromISO, toISO } = useDateRange();

  return useQuery({
    queryKey: ['insights', 'whatsapp', fromISO, toISO],
    staleTime: QUERY_STALE_TIME,
    gcTime: QUERY_GC_TIME,
    queryFn: async () => {
      const [chatRes, burstRes] = await Promise.all([
        supabase
          .from('Chat History')
          .select('id, created_at, "Sender Number", Name, "Sender Message", "Ai Reply", human_reply, is_human_controlled, is_archived')
          .gte('created_at', fromISO)
          .lte('created_at', toISO)
          .order('created_at', { ascending: false })
          .limit(1000),
        supabase
          .from('burst_messaging')
          .select('id, created_at, sender_number, message_type')
          .gte('created_at', fromISO)
          .lte('created_at', toISO)
          .limit(1000),
      ]);
      if (chatRes.error) throw chatRes.error;
      if (burstRes.error) throw burstRes.error;

      const chats = chatRes.data || [];
      const bursts = burstRes.data || [];
      const guestCounts = new Map<string, number>();

      const stats = chats.reduce(
        (acc, chat) => {
          const sender = chat['Sender Number'];
          const guestKey = String(chat.Name || sender || 'Unknown');

          if (sender) {
            acc.uniqueGuests.add(String(sender));
          }
          if (chat.is_human_controlled) acc.humanControlled += 1;
          if (chat.is_archived) acc.archived += 1;
          if (chat.human_reply) acc.replyMix[1].value += 1;
          else if (chat['Ai Reply']) acc.replyMix[0].value += 1;
          else acc.replyMix[2].value += 1;

          guestCounts.set(guestKey, (guestCounts.get(guestKey) || 0) + 1);
          return acc;
        },
        {
          uniqueGuests: new Set<string>(),
          humanControlled: 0,
          archived: 0,
          replyMix: [
            { name: 'AI reply', value: 0 },
            { name: 'Human reply', value: 0 },
            { name: 'No reply', value: 0 },
          ],
        }
      );

      const trend = dailySeries(from, to, chats, (row) => (row.created_at ? new Date(row.created_at) : null));
      const topGuests = Array.from(guestCounts.entries())
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 8);

      return {
        chats,
        bursts,
        kpis: {
          total: chats.length,
          uniqueGuests: stats.uniqueGuests.size,
          humanControlled: stats.humanControlled,
          archived: stats.archived,
        },
        trend,
        replyMix: stats.replyMix,
        topGuests,
      };
    },
  });
}
