import { useQuery } from '@tanstack/react-query';
import {
  DEPARTMENT_SECTIONS,
  LOCATION_TYPE_AS_STRING,
  REMARKS_TYPE_AS_STRING,
} from '@/lib/hotel-training-constants';
import { invokeReadColumns } from '@/services/sharepoint';
import type { ListColumnsResult } from '@/services/sharepoint';

const STATIC_FALLBACK: ListColumnsResult = {
  departments: Object.keys(DEPARTMENT_SECTIONS),
  locationTypeAsString: LOCATION_TYPE_AS_STRING,
  remarksTypeAsString: REMARKS_TYPE_AS_STRING,
};

export function useListColumns() {
  return useQuery<ListColumnsResult>({
    queryKey: ['listColumns'],
    queryFn: async (): Promise<ListColumnsResult> => {
      try {
        const live = await invokeReadColumns();
        return {
          // Departments must match DEPARTMENT_SECTIONS (the dept→section
          // cascade is code-defined), so they always come from constants.
          departments: Object.keys(DEPARTMENT_SECTIONS),
          locationTypeAsString: live.locationTypeAsString || LOCATION_TYPE_AS_STRING,
          remarksTypeAsString: live.remarksTypeAsString || REMARKS_TYPE_AS_STRING,
        };
      } catch (err) {
        console.error('[useListColumns] Falling back to constants:', err);
        return STATIC_FALLBACK;
      }
    },
    staleTime: 30 * 60 * 1000,
  });
}
