import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useDateRange } from '@/contexts/DateRangeContext';
import { countBy } from './utils';

function natureFromText(t: string | null | undefined): string {
  const s = (t || '').toLowerCase();
  if (!s) return 'Other';
  if (s.includes('banquet') || s.includes('event') || s.includes('wedding')) return 'Banquet/Event';
  if (s.includes('book') || s.includes('reserv')) return 'Booking';
  if (s.includes('rate') || s.includes('price')) return 'Pricing';
  if (s.includes('complaint') || s.includes('issue')) return 'Complaint';
  if (s.includes('inquir') || s.includes('question') || s.includes('?')) return 'Inquiry';
  return 'Other';
}

export function useSocialInsights() {
  const { fromISO, toISO } = useDateRange();

  return useQuery({
    queryKey: ['insights', 'social', fromISO, toISO],
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

      const isIG = (r: typeof rows[number]) => (r.platform || '').toLowerCase().includes('insta') || (r.channel || '').toLowerCase().includes('insta');
      const isFB = (r: typeof rows[number]) => (r.platform || '').toLowerCase().includes('facebook') || (r.channel || '').toLowerCase().includes('facebook');
      // event_type values in DB: 'reply_sent', etc. Treat comment-related event_types as comments, otherwise DM/message engagement.
      const isComment = (r: typeof rows[number]) => (r.event_type || '').toLowerCase().includes('comment');
      const isDM = (r: typeof rows[number]) => !isComment(r);

      const igComments = rows.filter((r) => isIG(r) && isComment(r)).length;
      const igDMs = rows.filter((r) => isIG(r) && isDM(r)).length;
      const fbDMs = rows.filter((r) => isFB(r) && isDM(r)).length;
      const totalDMs = igDMs + fbDMs;

      const platformSplit = [
        { name: 'Instagram', value: rows.filter(isIG).length },
        { name: 'Facebook', value: rows.filter(isFB).length },
        { name: 'Other', value: rows.filter((r) => !isIG(r) && !isFB(r)).length },
      ].filter((x) => x.value > 0);

      const eventSplit = countBy(rows, (r) => r.event_type as string);
      const natureSplit = countBy(rows, (r) => natureFromText(r.notes || r.guest_message_text || r.status));

      return { rows, kpis: { igComments, totalDMs, igDMs, fbDMs }, platformSplit, eventSplit, natureSplit };
    },
  });
}
