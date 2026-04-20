import { createContext } from 'react';

export type DateRangePreset = 'yesterday' | 'last7' | 'last30' | 'custom';

export interface DateRangeContextType {
  preset: DateRangePreset;
  from: Date;
  to: Date;
  setPreset: (p: DateRangePreset) => void;
  setCustom: (from: Date, to: Date) => void;
  fromISO: string;
  toISO: string;
  fromDateKey: string;
  toDateKey: string;
  label: string;
}

export const DateRangeContext = createContext<DateRangeContextType | undefined>(undefined);
