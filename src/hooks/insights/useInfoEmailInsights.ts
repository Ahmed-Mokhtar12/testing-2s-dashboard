import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useDateRange } from '@/contexts/useDateRange';
import { countBy, fetchAllRows } from './utils';

const QUERY_STALE_TIME = 5 * 60 * 1000;
const QUERY_GC_TIME = 10 * 60 * 1000;

export function useInfoEmailInsights() {
  const { fromISO, toISO } = useDateRange();

  return useQuery({
    queryKey: ['insights', 'info-email', fromISO, toISO],
    staleTime: QUERY_STALE_TIME,
    gcTime: QUERY_GC_TIME,
    queryFn: async () => {
      const rows = await fetchAllRows((from, to) =>
        supabase
          .from('info_email_audit_log')
          .select('id, action, department, confidence, created_at, override')
          .gte('created_at', fromISO)
          .lte('created_at', toISO)
          .order('created_at', { ascending: false })
          .order('id', { ascending: false })
          .range(from, to)
      );
      const stats = rows.reduce(
        (acc, row) => {
          const action = (row.action || '').toLowerCase();
          if (action.includes('forward')) acc.forwarded += 1;
          if (action.includes('delet')) acc.deleted += 1;
          if (row.override) acc.overridden += 1;
          return acc;
        },
        { forwarded: 0, deleted: 0, overridden: 0 }
      );

      const actions = countBy(rows, (row) => row.action as string);
      const departments = countBy(
        rows.filter((row) => (row.action || '').toLowerCase().includes('forward')),
        (row) => row.department as string
      );
      const confidence = countBy(rows, (row) => row.confidence as string);

      return {
        rows,
        kpis: {
          total: rows.length,
          forwarded: stats.forwarded,
          deleted: stats.deleted,
          overridden: stats.overridden,
        },
        actions,
        departments,
        confidence,
      };
    },
  });
}
