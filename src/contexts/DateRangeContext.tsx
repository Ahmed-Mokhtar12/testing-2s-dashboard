import React, { useMemo, useState } from 'react';
import { format } from 'date-fns';
import {
  getDubaiNow,
  dubaiDateKey,
  dubaiStartOfDay,
  dubaiEndOfDay,
} from '@/utils/timezone';
import {
  DateRangeContext,
  type DateRangeContextType,
  type DateRangePreset,
} from './date-range-context';

export type { DateRangePreset } from './date-range-context';
export { useDateRange } from './useDateRange';

function subDaysSimple(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() - n);
  return x;
}

function rangeForPreset(
  p: DateRangePreset,
  custom?: { from: Date; to: Date }
): { from: Date; to: Date } {
  const todayDubai = getDubaiNow();
  if (p === 'yesterday') {
    const y = subDaysSimple(todayDubai, 1);
    return { from: y, to: y };
  }
  if (p === 'last7') return { from: subDaysSimple(todayDubai, 7), to: todayDubai };
  if (p === 'last30') return { from: subDaysSimple(todayDubai, 30), to: todayDubai };
  if (p === 'custom' && custom) return { from: custom.from, to: custom.to };
  const y = subDaysSimple(todayDubai, 1);
  return { from: y, to: y };
}

export const DateRangeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [preset, setPresetState] = useState<DateRangePreset>('last30');
  const [custom, setCustomState] = useState<{ from: Date; to: Date }>(() => {
    const y = subDaysSimple(getDubaiNow(), 1);
    return { from: y, to: y };
  });

  const { from, to } = useMemo(() => rangeForPreset(preset, custom), [preset, custom]);

  const fromISO = dubaiStartOfDay(from).toISOString();
  const toISO = dubaiEndOfDay(to).toISOString();
  const fromDateKey = dubaiDateKey(from);
  const toDateKey = dubaiDateKey(to);

  const value: DateRangeContextType = {
    preset,
    from,
    to,
    fromISO,
    toISO,
    fromDateKey,
    toDateKey,
    label:
      preset === 'yesterday'
        ? 'Yesterday'
        : preset === 'last7'
        ? 'Last 7 days'
        : preset === 'last30'
        ? 'Last 30 days'
        : `${format(from, 'MMM d')} – ${format(to, 'MMM d, yyyy')}`,
    setPreset: (p) => setPresetState(p),
    setCustom: (f, t) => {
      setCustomState({ from: f, to: t });
      setPresetState('custom');
    },
  };

  return <DateRangeContext.Provider value={value}>{children}</DateRangeContext.Provider>;
};
