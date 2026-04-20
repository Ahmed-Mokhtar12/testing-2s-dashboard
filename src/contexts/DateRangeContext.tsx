import React, { createContext, useContext, useMemo, useState } from 'react';
import { startOfDay, endOfDay, subDays, format } from 'date-fns';

export type DateRangePreset = 'yesterday' | 'last7' | 'last30' | 'custom';

export interface DateRangeValue {
  preset: DateRangePreset;
  from: Date;
  to: Date;
}

interface DateRangeContextType extends DateRangeValue {
  setPreset: (p: DateRangePreset) => void;
  setCustom: (from: Date, to: Date) => void;
  /** ISO strings for queries */
  fromISO: string;
  toISO: string;
  /** Display label */
  label: string;
}

const DateRangeContext = createContext<DateRangeContextType | undefined>(undefined);

function rangeForPreset(p: DateRangePreset, custom?: { from: Date; to: Date }): { from: Date; to: Date } {
  const today = new Date();
  if (p === 'yesterday') {
    const y = subDays(today, 1);
    return { from: startOfDay(y), to: endOfDay(y) };
  }
  if (p === 'last7') return { from: startOfDay(subDays(today, 7)), to: endOfDay(today) };
  if (p === 'last30') return { from: startOfDay(subDays(today, 30)), to: endOfDay(today) };
  if (p === 'custom' && custom) return { from: startOfDay(custom.from), to: endOfDay(custom.to) };
  // fallback
  const y = subDays(today, 1);
  return { from: startOfDay(y), to: endOfDay(y) };
}

export const DateRangeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [preset, setPresetState] = useState<DateRangePreset>('yesterday');
  const [custom, setCustomState] = useState<{ from: Date; to: Date }>(() => {
    const y = subDays(new Date(), 1);
    return { from: y, to: y };
  });

  const { from, to } = useMemo(() => rangeForPreset(preset, custom), [preset, custom]);

  const value: DateRangeContextType = {
    preset,
    from,
    to,
    fromISO: from.toISOString(),
    toISO: to.toISOString(),
    label:
      preset === 'yesterday' ? 'Yesterday' :
      preset === 'last7' ? 'Last 7 days' :
      preset === 'last30' ? 'Last 30 days' :
      `${format(from, 'MMM d')} – ${format(to, 'MMM d, yyyy')}`,
    setPreset: (p) => setPresetState(p),
    setCustom: (f, t) => {
      setCustomState({ from: f, to: t });
      setPresetState('custom');
    },
  };

  return <DateRangeContext.Provider value={value}>{children}</DateRangeContext.Provider>;
};

export function useDateRange() {
  const ctx = useContext(DateRangeContext);
  if (!ctx) throw new Error('useDateRange must be used inside DateRangeProvider');
  return ctx;
}
