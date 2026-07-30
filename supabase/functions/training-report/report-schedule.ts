// Pure scheduling logic for training report emails. ZERO imports: runs under
// Deno (edge deploy) and Node type-stripping (unit tests) alike.
// All calendar math is Asia/Dubai = UTC+4 fixed (no DST).

const HOUR_MS = 3600_000;
const DUBAI_OFFSET_MS = 4 * HOUR_MS;
const SEND_HOUR_DUBAI = 8;

// No report is ever due for a period before the feature's first scheduled
// month. Without this floor, widening the retry windows would make every
// pre-launch month retroactively due the moment the scheduler starts —
// emailing historical (and, for months with no training, all-zero) reports
// nobody asked for. Reports for 2026-07 and earlier are deliberately out of
// scope: the user reviews those via mode:'test' instead.
export const EARLIEST_PERIOD = '2026-08';

export interface DueReport {
  reportType: 'monthly_summary' | 'reminder';
  period: string;          // YYYY-MM the report covers
  dueDate: string;         // YYYY-MM-DD (Dubai) nominal due day
  delayed: boolean;        // true when now is past the due day
  rangeFromISO: string;    // inclusive, +04:00
  rangeToExclusiveISO: string;
  daysLeftInMonth?: number; // reminder only: full days remaining after "today"
}

export function dubaiToday(nowUtcMs: number): { ymd: string; hour: number } {
  const d = new Date(nowUtcMs + DUBAI_OFFSET_MS);
  return { ymd: d.toISOString().slice(0, 10), hour: d.getUTCHours() };
}

export function lastDayOfMonth(year: number, month1: number): number {
  return new Date(Date.UTC(year, month1, 0)).getUTCDate();
}

export function reminderDay(year: number, month1: number): number {
  return lastDayOfMonth(year, month1) - 7;
}

const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
const dubaiMidnightISO = (y: number, m: number, d: number) =>
  `${ymd(y, m, d)}T00:00:00+04:00`;

// Dubai midnight ISO string for the calendar day AFTER (y, m, d), computed
// via real date arithmetic (Date.UTC normalizes an out-of-range day, e.g.
// month=7 day=32 -> Aug 1) instead of string-concatenating `d + 1` into an
// ISO literal — the latter produces an invalid date like
// "2026-07-32T00:00:00+04:00" on the last day of a month, which Postgres
// rejects outright. The UTC fields here are used purely as a calendar-date
// calculator (Dubai has no DST, fixed +04:00), not as the actual instant.
export function nextDayDubaiMidnightISO(y: number, m: number, d: number): string {
  const next = new Date(Date.UTC(y, m - 1, d + 1));
  return dubaiMidnightISO(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate());
}

export function dueReports(nowUtcMs: number): DueReport[] {
  const { ymd: today, hour } = dubaiToday(nowUtcMs);
  const [y, m, d] = today.split('-').map(Number);
  const due: DueReport[] = [];

  // Monthly summary for the PREVIOUS month: due from day 1 at 08:00 Dubai
  // and remains due for the rest of the CURRENT month (no grace-window
  // cutoff). report_runs plus the atomic claim (in index.ts) prevent
  // duplicate rows and stop two concurrent invocations from both sending —
  // but this is at-least-once, not exactly-once: a Graph sendMail that
  // succeeds while its response is lost is still retried and can produce a
  // genuine duplicate email. A late report still strictly dominates a
  // missing one, so once the on-time gate has opened there is no reason to
  // ever stop retrying within the same month.
  // Residual limitation (documented, not fixed here): once the calendar
  // rolls into the NEXT month, this period is superseded by the new
  // "previous month" and is never revisited — if every hourly attempt
  // failed for the whole window, the only surviving trace is a permanent
  // 'failed' row in report_runs, which nothing alerts on.
  if (d > 1 || hour >= SEND_HOUR_DUBAI) {
    const py = m === 1 ? y - 1 : y;
    const pm = m === 1 ? 12 : m - 1;
    const period = `${py}-${pad(pm)}`;
    if (period >= EARLIEST_PERIOD) {
      due.push({
        reportType: 'monthly_summary',
        period,
        dueDate: ymd(y, m, 1),
        delayed: d > 1,
        rangeFromISO: dubaiMidnightISO(py, pm, 1),
        rangeToExclusiveISO: dubaiMidnightISO(y, m, 1),
      });
    }
  }

  // Reminder for the CURRENT month: due from day (lastDay-7) at 08:00 Dubai
  // through the END of the same month — never later, since a reminder is
  // meaningless once its own month has closed (same "retry until sent, but
  // bounded by relevance" reasoning as the summary above).
  const rd = reminderDay(y, m);
  const last = lastDayOfMonth(y, m);
  if (d >= rd && (d > rd || hour >= SEND_HOUR_DUBAI)) {
    const period = `${y}-${pad(m)}`;
    if (period >= EARLIEST_PERIOD) {
      due.push({
        reportType: 'reminder',
        period,
        dueDate: ymd(y, m, rd),
        delayed: d > rd,
        rangeFromISO: dubaiMidnightISO(y, m, 1),
        // Month-to-date includes today, so the exclusive end is tomorrow. The
        // window now runs through the LAST day of the month, so d+1 CAN
        // overflow into next month (unlike the old 3-day grace window, which
        // capped d at lastDay-5) — nextDayDubaiMidnightISO handles that via
        // real date arithmetic.
        rangeToExclusiveISO: nextDayDubaiMidnightISO(y, m, d),
        daysLeftInMonth: last - d,
      });
    }
  }

  return due;
}
