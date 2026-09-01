import React, { useEffect, useMemo, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { fromZonedTime } from 'date-fns-tz';
import { DUBAI_TIMEZONE, dubaiDateKey } from '@/utils/timezone';
import { presetDateKeys } from '@/lib/date-range';
import {
  DateRangeContext,
  type DateRangeContextType,
  type DateRangePreset,
} from './date-range-context';

// The source of truth is a pair of Dubai date KEYS. The previous implementation fed a
// toZonedTime()-shifted "now" into helpers that converted to Dubai a second time, so any
// browser not at UTC+4 got the wrong day for every preset (audit A4).
const DAY_TICK_MS = 60_000;

export const DateRangeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [preset, setPresetState] = useState<DateRangePreset>('yesterday');
  const [customKeys, setCustomKeys] = useState<{ fromKey: string; toKey: string } | undefined>(undefined);
  // Re-evaluate "today" once a minute so a tab left open rolls over at Dubai midnight.
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), DAY_TICK_MS);
    return () => window.clearInterval(id);
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps -- tick is the clock input
  const todayKey = useMemo(() => dubaiDateKey(new Date()), [tick]);
  const { fromKey, toKey } = useMemo(
    () => presetDateKeys(preset, todayKey, customKeys),
    [preset, todayKey, customKeys],
  );

  // Absolute instants for timestamptz filters: Dubai midnight to Dubai 23:59:59.999.
  const fromISO = useMemo(() => fromZonedTime(`${fromKey}T00:00:00.000`, DUBAI_TIMEZONE).toISOString(), [fromKey]);
  const toISO = useMemo(() => fromZonedTime(`${toKey}T23:59:59.999`, DUBAI_TIMEZONE).toISOString(), [toKey]);
  // Local wall-clock Dates of the same calendar days — for labels, the calendar widget and
  // eachDayOfInterval ONLY. Never convert these back to Dubai.
  const from = useMemo(() => parseISO(fromKey), [fromKey]);
  const to = useMemo(() => parseISO(toKey), [toKey]);

  const value: DateRangeContextType = {
    preset,
    from,
    to,
    fromISO,
    toISO,
    fromDateKey: fromKey,
    toDateKey: toKey,
    label:
      preset === 'yesterday'
        ? 'Yesterday'
        : preset === 'last7'
          ? 'Last 7 days'
          : preset === 'last30'
            ? 'Last 30 days'
            : `${format(from, 'MMM d')} - ${format(to, 'MMM d, yyyy')}`,
    setPreset: (nextPreset) => setPresetState(nextPreset),
    // The picker's Dates ARE the picked calendar days in local time, so the local key is
    // the right one — not dubaiDateKey, which would shift them east of Dubai.
    setCustom: (nextFrom, nextTo) => {
      setCustomKeys({ fromKey: format(nextFrom, 'yyyy-MM-dd'), toKey: format(nextTo, 'yyyy-MM-dd') });
      setPresetState('custom');
    },
  };

  return <DateRangeContext.Provider value={value}>{children}</DateRangeContext.Provider>;
};
