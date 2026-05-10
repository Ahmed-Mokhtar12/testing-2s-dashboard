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

function subDaysSimple(date: Date, days: number): Date {
  const value = new Date(date);
  value.setDate(value.getDate() - days);
  return value;
}

function rangeForPreset(
  preset: DateRangePreset,
  custom?: { from: Date; to: Date }
): { from: Date; to: Date } {
  const todayDubai = getDubaiNow();
  if (preset === 'yesterday') {
    const yesterday = subDaysSimple(todayDubai, 1);
    return { from: yesterday, to: yesterday };
  }
  if (preset === 'last7') return { from: subDaysSimple(todayDubai, 7), to: todayDubai };
  if (preset === 'last30') return { from: subDaysSimple(todayDubai, 30), to: todayDubai };
  if (preset === 'custom' && custom) return { from: custom.from, to: custom.to };
  const yesterday = subDaysSimple(todayDubai, 1);
  return { from: yesterday, to: yesterday };
}

export const DateRangeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [preset, setPresetState] = useState<DateRangePreset>('yesterday');
  const [custom, setCustomState] = useState<{ from: Date; to: Date }>(() => {
    const yesterday = subDaysSimple(getDubaiNow(), 1);
    return { from: yesterday, to: yesterday };
  });

  const { from, to } = useMemo(() => rangeForPreset(preset, custom), [preset, custom]);

  const fromISO = useMemo(() => dubaiStartOfDay(from).toISOString(), [from]);
  const toISO = useMemo(() => dubaiEndOfDay(to).toISOString(), [to]);
  const fromDateKey = useMemo(() => dubaiDateKey(from), [from]);
  const toDateKey = useMemo(() => dubaiDateKey(to), [to]);

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
            : `${format(from, 'MMM d')} - ${format(to, 'MMM d, yyyy')}`,
    setPreset: (nextPreset) => setPresetState(nextPreset),
    setCustom: (nextFrom, nextTo) => {
      setCustomState({ from: nextFrom, to: nextTo });
      setPresetState('custom');
    },
  };

  return <DateRangeContext.Provider value={value}>{children}</DateRangeContext.Provider>;
};
