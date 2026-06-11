import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Colleague } from '@/types/hotel-training';

export function useColleagues() {
  return useQuery<Colleague[], Error>({
    queryKey: ['colleagues'],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('sp-read-colleagues');
      if (error) throw error;
      return data as Colleague[];
    },
    staleTime: 5 * 60 * 1000,
  });
}
