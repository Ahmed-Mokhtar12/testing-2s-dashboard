import { useQuery } from '@tanstack/react-query';
import {
  DEPARTMENT_SECTIONS,
  LOCATION_TYPE_AS_STRING,
  REMARKS_TYPE_AS_STRING,
} from '@/lib/hotel-training-constants';
import { invokeReadColumns, readMirror } from '@/services/sharepoint';
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
      // The Postgres mirror first: same payload, ~100 ms instead of a cold edge
      // function. Absent or stale falls through to exactly the path below.
      // Departments are still taken from constants, for the reason stated there.
      const mirrored = await readMirror<Partial<ListColumnsResult>>('columns');
      if (mirrored) {
        return {
          departments: Object.keys(DEPARTMENT_SECTIONS),
          locationTypeAsString: mirrored.locationTypeAsString || LOCATION_TYPE_AS_STRING,
          remarksTypeAsString: mirrored.remarksTypeAsString || REMARKS_TYPE_AS_STRING,
        };
      }

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
    // Render step 1 immediately instead of waiting ~3 s for a cold edge function.
    // placeholderData, NOT initialData: initialData is stored as real cached data
    // and respects staleTime, so with staleTime at 30 minutes the live value
    // would never be fetched at all. placeholderData shows the fallback while the
    // request is genuinely in flight and is replaced when it lands.
    //
    // Safe because the fallback IS the live answer in the normal case: the only
    // live-derived values are locationTypeAsString/remarksTypeAsString, both
    // 'Text' unless someone changes field_5/field_7 to Number in SharePoint. If
    // that happens, TrainingDetailsForm rebuilds its Zod schema from the prop
    // (useMemo on those two values), so the upgrade applies without a remount.
    placeholderData: STATIC_FALLBACK,
  });
}
