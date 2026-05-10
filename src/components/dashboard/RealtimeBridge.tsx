import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

const TABLE_TO_QUERY_KEY: Record<string, string[]> = {
  reviews: ['insights', 'reviews'],
  'Chat History': ['insights', 'whatsapp'],
  welcome_message_success_log: ['insights', 'welcome'],
};

export const RealtimeBridge: React.FC = () => {
  const queryClient = useQueryClient();

  useEffect(() => {
    const tables = Object.keys(TABLE_TO_QUERY_KEY);

    const channels = tables.map((table) =>
      supabase
        .channel(`rt-${table}`)
        .on(
          'postgres_changes' as never,
          { event: '*', schema: 'public', table } as never,
          () => {
            const queryKey = TABLE_TO_QUERY_KEY[table];
            queryClient.invalidateQueries({ queryKey });
          }
        )
        .subscribe((status, error) => {
          if (error && import.meta.env.DEV) {
            console.error(`Realtime subscription error for ${table}:`, status, error);
          }
        })
    );

    return () => {
      channels.forEach((channel) => {
        channel.unsubscribe();
        supabase.removeChannel(channel);
      });
    };
  }, [queryClient]);

  return null;
};

export default RealtimeBridge;
