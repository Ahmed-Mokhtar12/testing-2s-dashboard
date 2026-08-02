import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { extractInvokeError, readMirror } from '@/services/sharepoint';
import type { Colleague } from '@/types/hotel-training';

export function useColleagues() {
  return useQuery<Colleague[], Error>({
    queryKey: ['colleagues'],
    queryFn: async () => {
      // The Postgres mirror first: same payload, ~100 ms instead of a cold edge
      // function. Absent or stale falls through to exactly the path below.
      //
      // An empty array is treated as no mirror on purpose. A colleague list with
      // zero entries makes step 2 unusable, and it is far likelier to mean a bad
      // write than a genuinely empty SharePoint list — so pay the 3 s and ask
      // Graph rather than render a wizard nobody can complete.
      const mirrored = await readMirror<Colleague[]>('colleagues');
      if (Array.isArray(mirrored) && mirrored.length > 0) return mirrored;

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
