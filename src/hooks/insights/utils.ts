import { format, eachDayOfInterval } from 'date-fns';

/** Group rows by day key (yyyy-MM-dd) using a date accessor. */
export function groupByDay<T>(rows: T[], getDate: (r: T) => Date | null | undefined): Record<string, T[]> {
  const out: Record<string, T[]> = {};
  for (const r of rows) {
    const d = getDate(r);
    if (!d) continue;
    const key = format(d, 'yyyy-MM-dd');
    (out[key] ||= []).push(r);
  }
  return out;
}

/** Build a continuous daily series between from..to filling 0 for missing days. */
export function dailySeries<T>(
  from: Date,
  to: Date,
  rows: T[],
  getDate: (r: T) => Date | null | undefined,
  reducer: (bucket: T[]) => number = (b) => b.length
): { date: string; label: string; value: number }[] {
  const groups = groupByDay(rows, getDate);
  return eachDayOfInterval({ start: from, end: to }).map((d) => {
    const key = format(d, 'yyyy-MM-dd');
    return { date: key, label: format(d, 'MMM d'), value: reducer(groups[key] || []) };
  });
}

/** Count occurrences by a string key. */
export function countBy<T>(rows: T[], key: (r: T) => string | null | undefined): { name: string; value: number }[] {
  const m = new Map<string, number>();
  for (const r of rows) {
    const k = (key(r) || 'Unknown').trim() || 'Unknown';
    m.set(k, (m.get(k) || 0) + 1);
  }
  return Array.from(m.entries())
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
}

export const safeNum = (v: unknown): number => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};
