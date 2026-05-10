import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useDateRange } from '@/contexts/useDateRange';
import { dailySeries, countBy } from './utils';

const QUERY_STALE_TIME = 5 * 60 * 1000;
const QUERY_GC_TIME = 10 * 60 * 1000;

export function useEmailInsights() {
  const { from, to, fromISO, toISO } = useDateRange();

  return useQuery({
    queryKey: ['insights', 'email', fromISO, toISO],
    staleTime: QUERY_STALE_TIME,
    gcTime: QUERY_GC_TIME,
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

      const guestThreads = a.data || [];
      const websiteThreads = b.data || [];
      const bursts = c.data || [];
      const threads = [
        ...guestThreads.map((row) => ({ ...row, source: 'guest' as const })),
        ...websiteThreads.map((row) => ({ ...row, source: 'website' as const })),
      ];

      const stats = threads.reduce(
        (acc, thread) => {
          const direction = (thread.last_direction || '').toLowerCase();
          if (direction.includes('in')) acc.inbound += 1;
          if (direction.includes('out')) acc.outbound += 1;
          return acc;
        },
        { inbound: 0, outbound: 0 }
      );

      const platformsCount = new Set(bursts.map((row) => row.platform).filter(Boolean)).size;
      const trendGuest = dailySeries(from, to, guestThreads, (row) => (row.created_at ? new Date(row.created_at) : null));
      const trendWeb = dailySeries(from, to, websiteThreads, (row) => (row.created_at ? new Date(row.created_at) : null));
      const trend = trendGuest.map((row, index) => ({
        label: row.label,
        guest: row.value,
        website: trendWeb[index]?.value || 0,
      }));

      const categories = countBy(threads, (thread) => thread.normalized_category as string).slice(0, 8);
      const platforms = countBy(bursts, (burst) => burst.platform as string);

      return {
        threads,
        bursts,
        kpis: { total: threads.length, inbound: stats.inbound, outbound: stats.outbound, platformsCount },
        trend,
        categories,
        platforms,
      };
    },
  });
}
