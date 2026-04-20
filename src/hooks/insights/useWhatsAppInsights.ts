import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useDateRange } from '@/contexts/DateRangeContext';
import { dailySeries, countBy } from './utils';
import { useRealtimeInvalidate } from './useRealtimeInvalidate';

export function useWhatsAppInsights() {
  const { from, to, fromISO, toISO } = useDateRange();

  useRealtimeInvalidate('Chat History', ['insights', 'whatsapp']);

  return useQuery({
    queryKey: ['insights', 'whatsapp', fromISO, toISO],
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

      const total = chats.length;
      const uniqueGuests = new Set(chats.map((c) => c['Sender Number']).filter(Boolean)).size;
      const humanControlled = chats.filter((c) => c.is_human_controlled).length;
      const archived = chats.filter((c) => c.is_archived).length;

      const trend = dailySeries(from, to, chats, (r) => (r.created_at ? new Date(r.created_at) : null));
      const replyMix = [
        { name: 'AI reply', value: chats.filter((c) => !!c['Ai Reply'] && !c.human_reply).length },
        { name: 'Human reply', value: chats.filter((c) => !!c.human_reply).length },
        { name: 'No reply', value: chats.filter((c) => !c['Ai Reply'] && !c.human_reply).length },
      ];
      const topGuests = countBy(chats, (c) => (c.Name || c['Sender Number']) as string).slice(0, 8);

      return { chats, bursts, kpis: { total, uniqueGuests, humanControlled, archived }, trend, replyMix, topGuests };
    },
  });
}
