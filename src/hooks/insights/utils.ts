import { format, eachDayOfInterval, parseISO } from 'date-fns';

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

/** Group rows by an explicit date-key accessor (yyyy-MM-dd string) — no Date parsing. */
export function groupByDayKey<T>(
  rows: T[],
  getKey: (r: T) => string | null | undefined
): Record<string, T[]> {
  const out: Record<string, T[]> = {};
  for (const r of rows) {
    const k = getKey(r);
    if (!k) continue;
    const key = k.slice(0, 10);
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

/**
 * Daily series driven by date-key strings (yyyy-MM-dd) — avoids any timezone shift
 * that can happen when feeding a `date` column value to `new Date(...)`.
 */
export function dailySeriesByDateKey<T>(
  fromKey: string,
  toKey: string,
  rows: T[],
  getKey: (r: T) => string | null | undefined,
  reducer: (bucket: T[]) => number = (b) => b.length
): { date: string; label: string; value: number }[] {
  const groups = groupByDayKey(rows, getKey);
  // parseISO on yyyy-MM-dd produces a stable local Date; we only use it for labels & iteration.
  const start = parseISO(fromKey);
  const end = parseISO(toKey);
  return eachDayOfInterval({ start, end }).map((d) => {
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

/**
 * Fetches all rows from a Supabase query that may exceed the server-side
 * PostgREST max_rows cap (default 1,000) by paginating with .range().
 * Pass a builder fn that accepts (from, to) and returns a Supabase query.
 */
export async function fetchAllRows<T>(
  buildQuery: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>
): Promise<T[]> {
  const PAGE = 1000;
  const result: T[] = [];
  let offset = 0;
  while (true) {
    const { data, error } = await buildQuery(offset, offset + PAGE - 1);
    if (error) throw error;
    const page = data ?? [];
    result.push(...page);
    if (page.length < PAGE) break;
    offset += PAGE;
  }
  return result;
}
