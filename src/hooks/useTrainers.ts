import { useQuery } from '@tanstack/react-query';
import { FALLBACK_TRAINERS } from '@/lib/hotel-training-constants';
import { invokeReadTrainers } from '@/services/sharepoint';
import type { TrainerRef } from '@/types/hotel-training';

// Live company directory for the trainer picker; falls back to the three
// known trainers when the directory call fails or returns nothing.
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
  });
}
