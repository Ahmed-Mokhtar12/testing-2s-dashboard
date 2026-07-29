// Pure aggregation logic for the query_training_records tool.
// ZERO imports on purpose: this module runs under Deno (edge deploy)
// and under Node 24 type-stripping (unit tests via `node --test`).

export interface DateRangeResult {
  fromISO: string | null;
  toExclusiveISO: string | null;
  swapped: boolean;
  error: string | null;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isRealDate(ymd: string): boolean {
  const d = new Date(`${ymd}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === ymd;
}

function addOneDay(ymd: string): string {
  const d = new Date(Date.parse(`${ymd}T00:00:00Z`) + 24 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

export function buildDateRange(date_from?: string, date_to?: string): DateRangeResult {
  const bad = (which: string, value: string): DateRangeResult => ({
    fromISO: null,
    toExclusiveISO: null,
    swapped: false,
    error: `Invalid ${which} "${value}": must be a real date in YYYY-MM-DD format.`,
  });

  if (date_from !== undefined && (!DATE_RE.test(date_from) || !isRealDate(date_from))) {
    return bad('date_from', date_from);
  }
  if (date_to !== undefined && (!DATE_RE.test(date_to) || !isRealDate(date_to))) {
    return bad('date_to', date_to);
  }

  let from = date_from ?? null;
  let to = date_to ?? null;
  let swapped = false;
  if (from && to && from > to) {
    [from, to] = [to, from];
    swapped = true;
  }

  return {
    fromISO: from ? `${from}T00:00:00+04:00` : null,
    toExclusiveISO: to ? `${addOneDay(to)}T00:00:00+04:00` : null,
    swapped,
    error: null,
  };
}
