// Pure scheduling logic for training report emails. ZERO imports: runs under
// Deno (edge deploy) and Node type-stripping (unit tests) alike.
// All calendar math is Asia/Dubai = UTC+4 fixed (no DST).

const HOUR_MS = 3600_000;
const DUBAI_OFFSET_MS = 4 * HOUR_MS;
const SEND_HOUR_DUBAI = 8;
const SUMMARY_GRACE_DAYS = 7;
const REMINDER_GRACE_DAYS = 3;

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

export function dueReports(nowUtcMs: number): DueReport[] {
  const { ymd: today, hour } = dubaiToday(nowUtcMs);
  const [y, m, d] = today.split('-').map(Number);
  const due: DueReport[] = [];

  // Monthly summary for the PREVIOUS month: due day 1, grace window 7 days.
  if (d <= SUMMARY_GRACE_DAYS && (d > 1 || hour >= SEND_HOUR_DUBAI)) {
    const py = m === 1 ? y - 1 : y;
    const pm = m === 1 ? 12 : m - 1;
    due.push({
      reportType: 'monthly_summary',
      period: `${py}-${pad(pm)}`,
      dueDate: ymd(y, m, 1),
      delayed: d > 1,
      rangeFromISO: dubaiMidnightISO(py, pm, 1),
      rangeToExclusiveISO: dubaiMidnightISO(y, m, 1),
    });
  }

  // Reminder for the CURRENT month: due lastDay-7, grace window 3 days.
  const rd = reminderDay(y, m);
  const pastDue = d - rd;
  if (pastDue >= 0 && pastDue < REMINDER_GRACE_DAYS && (d > rd || hour >= SEND_HOUR_DUBAI)) {
    const last = lastDayOfMonth(y, m);
    // Exclusive end = start of tomorrow (month-to-date includes today).
    const tm = d === last ? (m === 12 ? 1 : m + 1) : m;
    const ty = d === last && m === 12 ? y + 1 : y;
    const td = d === last ? 1 : d + 1;
    due.push({
      reportType: 'reminder',
      period: `${y}-${pad(m)}`,
      dueDate: ymd(y, m, rd),
      delayed: d > rd,
      rangeFromISO: dubaiMidnightISO(y, m, 1),
      rangeToExclusiveISO: dubaiMidnightISO(ty, tm, td),
      daysLeftInMonth: last - d,
    });
  }

  return due;
}
