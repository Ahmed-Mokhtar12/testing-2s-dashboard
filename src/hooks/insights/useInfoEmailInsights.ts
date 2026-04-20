import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useDateRange } from '@/contexts/DateRangeContext';
import { countBy } from './utils';

export function useInfoEmailInsights() {
  const { fromISO, toISO } = useDateRange();

  return useQuery({
    queryKey: ['insights', 'info-email', fromISO, toISO],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('info_email_audit_log')
        .select('id, action, department, confidence, created_at, override')
        .gte('created_at', fromISO)
        .lte('created_at', toISO)
        .order('created_at', { ascending: false })
        .limit(1000);
      if (error) throw error;
      const rows = data || [];

      const total = rows.length;
      const forwarded = rows.filter((r) => (r.action || '').toLowerCase().includes('forward')).length;
      const deleted = rows.filter((r) => (r.action || '').toLowerCase().includes('delet')).length;
      const overridden = rows.filter((r) => r.override).length;

      const actions = countBy(rows, (r) => r.action as string);
      const departments = countBy(rows.filter((r) => (r.action || '').toLowerCase().includes('forward')), (r) => r.department as string);
      const confidence = countBy(rows, (r) => r.confidence as string);

      return { rows, kpis: { total, forwarded, deleted, overridden }, actions, departments, confidence };
    },
  });
}
