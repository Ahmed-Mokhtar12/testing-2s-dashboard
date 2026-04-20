import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Mounts once inside DashboardShell. Subscribes to Supabase Realtime on the
 * three enabled tables and invalidates the matching React Query caches so
 * KPIs auto-refresh without a page reload.
 */
export const RealtimeBridge: React.FC = () => {
  const qc = useQueryClient();

  useEffect(() => {
    const subs = [
      { table: 'reviews', key: ['insights', 'reviews'] },
      { table: 'Chat History', key: ['insights', 'whatsapp'] },
      { table: 'welcome_message_success_log', key: ['insights', 'welcome'] },
    ] as const;

    const channels = subs.map(({ table, key }) =>
      supabase
        .channel(`rt-${table}`)
        .on(
          'postgres_changes' as never,
          { event: '*', schema: 'public', table } as never,
          () => qc.invalidateQueries({ queryKey: key as unknown as readonly unknown[] }),
        )
        .subscribe(),
    );

    return () => {
      channels.forEach((c) => supabase.removeChannel(c));
    };
  }, [qc]);

  return null;
};

export default RealtimeBridge;
