import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { extractInvokeError } from '@/services/sharepoint';
import type { Colleague } from '@/types/hotel-training';

export function useColleagues() {
  return useQuery<Colleague[], Error>({
    queryKey: ['colleagues'],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('sp-read-colleagues');
      if (error) {
        const detail = await extractInvokeError(error);
        throw new Error(`Could not load colleagues from SharePoint: ${detail}`);
      }
      if (!Array.isArray(data)) {
        throw new Error('Could not load colleagues from SharePoint: unexpected response shape.');
      }
      return data as Colleague[];
    },
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
}
