import {
  DEPARTMENT_SECTIONS,
  LOCATION_TYPE_AS_STRING,
  REMARKS_TYPE_AS_STRING,
  TRAINER_OPTIONS,
} from '@/lib/hotel-training-constants';
import type { ListColumnsResult } from '@/services/sharepoint';

const COLUMNS: ListColumnsResult = {
  departments: Object.keys(DEPARTMENT_SECTIONS),
  trainers: TRAINER_OPTIONS,
  locationTypeAsString: LOCATION_TYPE_AS_STRING,
  remarksTypeAsString: REMARKS_TYPE_AS_STRING,
};

export function useListColumns() {
  return { data: COLUMNS, isLoading: false };
}
