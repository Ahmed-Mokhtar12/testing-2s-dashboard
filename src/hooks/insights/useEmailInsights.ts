import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useDateRange } from '@/contexts/DateRangeContext';
import { dailySeries, countBy } from './utils';

export function useEmailInsights() {
  const { from, to, fromISO, toISO } = useDateRange();

  return useQuery({
    queryKey: ['insights', 'email', fromISO, toISO],
    queryFn: async () => {
      const [a, b, c] = await Promise.all([
        supabase
          .from('email_threads')
          .select('id, created_at, last_direction, normalized_category, status, last_update_at')
          .gte('created_at', fromISO).lte('created_at', toISO).limit(1000),
        supabase
          .from('website_email_threads')
          .select('id, created_at, last_direction, normalized_category, status')
          .gte('created_at', fromISO).lte('created_at', toISO).limit(1000),
        supabase
          .from('burst_email')
          .select('id, create_at, platform')
          .gte('create_at', fromISO).lte('create_at', toISO).limit(1000),
      ]);
      if (a.error) throw a.error;
      if (b.error) throw b.error;
      if (c.error) throw c.error;

      const threads = [
        ...(a.data || []).map((r) => ({ ...r, source: 'guest' as const })),
        ...(b.data || []).map((r) => ({ ...r, source: 'website' as const })),
      ];
      const bursts = c.data || [];

      const total = threads.length;
      const inbound = threads.filter((t) => (t.last_direction || '').toLowerCase().includes('in')).length;
      const outbound = threads.filter((t) => (t.last_direction || '').toLowerCase().includes('out')).length;
      const platformsCount = new Set(bursts.map((x) => x.platform).filter(Boolean)).size;

      const trendGuest = dailySeries(from, to, a.data || [], (r) => (r.created_at ? new Date(r.created_at) : null));
      const trendWeb = dailySeries(from, to, b.data || [], (r) => (r.created_at ? new Date(r.created_at) : null));
      const trend = trendGuest.map((row, i) => ({
        label: row.label, guest: row.value, website: trendWeb[i]?.value || 0,
      }));

      const categories = countBy(threads, (t) => t.normalized_category as string).slice(0, 8);
      const platforms = countBy(bursts, (t) => t.platform as string);

      return { threads, bursts, kpis: { total, inbound, outbound, platformsCount }, trend, categories, platforms };
    },
  });
}
