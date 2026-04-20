import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Subscribe to Supabase Realtime changes on a table and invalidate
 * a React Query key prefix so KPIs auto-refresh without reload.
 */
export function useRealtimeInvalidate(
  table: string,
  queryKeyPrefix: readonly unknown[],
  channelSuffix?: string,
) {
  const qc = useQueryClient();

  useEffect(() => {
    const channelName = `rt-${table}-${channelSuffix ?? 'default'}`;
    const channel = supabase
      .channel(channelName)
      .on(
        // @ts-expect-error - postgres_changes is supported at runtime
        'postgres_changes',
        { event: '*', schema: 'public', table },
        () => {
          qc.invalidateQueries({ queryKey: queryKeyPrefix });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table, channelSuffix]);
}
