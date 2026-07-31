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

// --- Period/range resolution for mode:'send' --------------------------------
// Moved here from index.ts (which cannot be unit-tested under Node because
// of its Deno `jsr:` imports) so this date logic — the newest, least-exercised
// window computation in the feature — gets automated coverage. Pure move: no
// behaviour change.

export function monthLabel(year: number, month1: number): string {
  return new Date(Date.UTC(year, month1 - 1, 1))
    .toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

export interface ResolvedTestReport {
  reportType: 'monthly_summary' | 'reminder';
  period: string;
  periodLabel: string;
  rangeFromISO: string;
  rangeToExclusiveISO: string;
  dueDate: string;
  daysLeftInMonth?: number;
}

// mode:'send' takes an EXPLICIT, operator-chosen period (never defaulted —
// unlike index.ts's resolveTestReport) and bypasses dueReports()/EARLIEST_PERIOD
// entirely. It exists to seed the very first real report for a pre-launch
// period (July 2026, the only month with real training data — EARLIEST_PERIOD
// = '2026-08' means dueReports() will never surface it on its own).
//
// Unlike resolveTestReport's reminder branch — which deliberately always
// windows through the REAL current Dubai day regardless of the requested
// period, because its entire purpose is "preview as if this ran today" — a
// deliberate one-off send for a period that is NOT the current Dubai month
// must use the period's own full calendar month. Reusing the "always today"
// windowing here would silently span into a second month (or, for a period
// safely in the past, produce an empty/garbled trailing window) — exactly
// the kind of silent-corruption bug this engagement exists to avoid.
export function resolveSendReport(
  report: 'monthly' | 'reminder',
  period: string,
  nowUtcMs: number,
): ResolvedTestReport & { delayed: boolean } {
  const [y, m] = period.split('-').map(Number);
  const { ymd: today } = dubaiToday(nowUtcMs);

  if (report === 'monthly') {
    const nextY = m === 12 ? y + 1 : y;
    const nextM = m === 12 ? 1 : m + 1;
    const dueDate = `${nextY}-${pad(nextM)}-01`;
    return {
      reportType: 'monthly_summary',
      period,
      periodLabel: monthLabel(y, m),
      rangeFromISO: dubaiMidnightISO(y, m, 1),
      rangeToExclusiveISO: dubaiMidnightISO(nextY, nextM, 1),
      dueDate,
      // Nominal-due-date rule per the cron path: a period whose due date has
      // already passed relative to "today" is delayed (carries the banner);
      // a period whose due date is today or still in the future is not.
      delayed: today > dueDate,
    };
  }

  const [ty, tm, td] = today.split('-').map(Number);
  const isCurrentMonth = ty === y && tm === m;
  const nextY = m === 12 ? y + 1 : y;
  const nextM = m === 12 ? 1 : m + 1;
  const dueDate = `${y}-${pad(m)}-${pad(reminderDay(y, m))}`;
  return {
    reportType: 'reminder',
    period,
    periodLabel: monthLabel(y, m),
    rangeFromISO: dubaiMidnightISO(y, m, 1),
    // Current month -> month-to-date (same windowing dueReports() would use
    // today). Any OTHER month is NOT reliably "always in the past": mode:'send'
    // deliberately bypasses EARLIEST_PERIOD (that is the whole point of this
    // mode — see above), and isValidPeriod's `20\d{2}` floor still allows any
    // period up to 2099-12, so a future period reaches this branch too. When
    // it does, the period's own full calendar month is used (same as a past
    // period) since "today" has no relevance to a month that hasn't happened
    // yet either — this yields an all-zero report. That is acceptable: it is
    // reachable only via an explicit operator request gated behind admin
    // auth and confirm:true, never automatically.
    rangeToExclusiveISO: isCurrentMonth
      ? nextDayDubaiMidnightISO(ty, tm, td)
      : dubaiMidnightISO(nextY, nextM, 1),
    dueDate,
    delayed: today > dueDate,
    daysLeftInMonth: isCurrentMonth ? lastDayOfMonth(y, m) - td : 0,
  };
}
