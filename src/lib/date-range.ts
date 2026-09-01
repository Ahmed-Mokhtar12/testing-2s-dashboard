import type { DateRangePreset } from '../contexts/date-range-context'; // relative: node --test has no '@/' alias

// Calendar arithmetic on Dubai date KEYS ('yyyy-MM-dd'), never on Date fields (CLAUDE.md,
// Scheduling). Date.UTC is used purely as a calendar calculator.
export function shiftDateKey(key: string, days: number): string {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export function presetDateKeys(
  preset: DateRangePreset,
  todayKey: string,
  custom?: { fromKey: string; toKey: string },
): { fromKey: string; toKey: string } {
  if (preset === 'custom' && custom) return custom;
  // Inclusive of today: "Last 7 days" is seven calendar days ending today (it used to span
  // eight — audit A11).
  if (preset === 'last7') return { fromKey: shiftDateKey(todayKey, -6), toKey: todayKey };
  if (preset === 'last30') return { fromKey: shiftDateKey(todayKey, -29), toKey: todayKey };
  const yesterday = shiftDateKey(todayKey, -1);
  return { fromKey: yesterday, toKey: yesterday };
}
