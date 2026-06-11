import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Colleague } from '@/types/hotel-training';

// supabase.functions.invoke wraps a non-2xx response in a FunctionsHttpError
// whose `message` is generic ("Edge Function returned a non-2xx status code").
// The real reason lives in the response body — pull it out so callers can show it.
async function extractInvokeError(error: unknown): Promise<string> {
  const ctx = (error as { context?: Response }).context;
  if (ctx && typeof ctx.json === 'function') {
    try {
      const body = await ctx.json();
      if (body && typeof body.error === 'string') return body.error;
    } catch {
      /* response had no JSON body; fall through */
    }
  }
  return error instanceof Error ? error.message : String(error);
}

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
