import { useQuery } from '@tanstack/react-query';
import { FALLBACK_TRAINERS } from '@/lib/hotel-training-constants';
import { invokeReadTrainers } from '@/services/sharepoint';
import type { TrainerRef } from '@/types/hotel-training';

// Live SharePoint site User Information List for the trainer picker; falls
// back to the three known trainers when the call fails or returns nothing.
export function useTrainers() {
  return useQuery<TrainerRef[]>({
    queryKey: ['trainers'],
    queryFn: async (): Promise<TrainerRef[]> => {
      try {
        const live = await invokeReadTrainers();
        return live.length > 0 ? live : FALLBACK_TRAINERS;
      } catch (err) {
        console.error('[useTrainers] Falling back to the built-in trainer list:', err);
        return FALLBACK_TRAINERS;
      }
    },
    staleTime: 30 * 60 * 1000,
    // Same reasoning as useListColumns: the trainer picker is usable immediately
    // with the three known trainers rather than empty for ~3 s, and the live UIL
    // list replaces them when it arrives. placeholderData rather than initialData
    // so the fetch still happens — see the note there.
    //
    // This is the same list queryFn already falls back to on failure, so it can
    // never show a trainer that submit cannot resolve.
    placeholderData: FALLBACK_TRAINERS,
  });
}
