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
  period: string;          // YYYY-MM the report's DATA covers
  // YYYY-MM-DD — which scheduled send this is, and the report_runs primary
  // key alongside report_type. Always equal to dueDate.
  //
  // WHY THIS EXISTS. report_runs was keyed (report_type, period), which is
  // fine while each type fires once per month. It is not fine for a weekly
  // reminder: all four August Fridays share period '2026-08', so the first
  // Friday would set status='sent' and claimRun would then refuse every later
  // Friday as already-sent. The weekly would have silently degraded to
  // monthly with the cron reporting success throughout — caught in design
  // review, before shipping.
  occurrence: string;
  dueDate: string;         // YYYY-MM-DD (Dubai) nominal due day
  delayed: boolean;        // true when now is past the due day
  rangeFromISO: string;    // inclusive, +04:00
  rangeToExclusiveISO: string;
  daysLeftInMonth?: number; // reminder only: full days remaining after "today"
  daysElapsed?: number;     // reminder only: days of the month covered so far
  // Set when this occurrence must be RECORDED but not sent. Currently one
  // cause: the 1st of the month is a Friday, so the monthly summary and a
  // weekly land on the same morning and the summary wins. The string is the
  // human-readable reason, written to report_runs.skipped_reason so a gap in
  // the weekly series always has a visible cause rather than looking like a
  // missed send.
  skipReason?: string;
}

export function dubaiToday(nowUtcMs: number): { ymd: string; hour: number } {
  const d = new Date(nowUtcMs + DUBAI_OFFSET_MS);
  return { ymd: d.toISOString().slice(0, 10), hour: d.getUTCHours() };
}

export function lastDayOfMonth(year: number, month1: number): number {
  return new Date(Date.UTC(year, month1, 0)).getUTCDate();
}

// Date#getUTCDay(): Sunday=0 … Friday=5.
const FRIDAY = 5;

// Day of week for a DUBAI calendar date. The UTC fields of Date.UTC(...) are
// used purely as a calendar calculator here — legitimate because Dubai is a
// fixed +04:00 with no DST, the same reasoning nextDayDubaiMidnightISO relies
// on. Taking getUTCDay() off the real instant instead would be wrong for the
// 20:00–23:59 UTC window, where Dubai is already on the next day.
export function dubaiDayOfWeek(year: number, month1: number, day: number): number {
  return new Date(Date.UTC(year, month1 - 1, day)).getUTCDay();
}

export function fridaysInMonth(year: number, month1: number): number[] {
  const out: number[] = [];
  const last = lastDayOfMonth(year, month1);
  for (let d = 1; d <= last; d++) {
    if (dubaiDayOfWeek(year, month1, d) === FRIDAY) out.push(d);
  }
  return out;
}

// The weekly occurrence in force at Dubai (year, month, day, hour): the LATEST
// Friday of THIS month whose 08:00 Dubai has already passed. null when none
// has yet.
//
// This single definition is what bounds the retry window, and it is the reason
// two weeklies can never be due at once. The monthly summary deliberately
// stays due for its whole month (a late report beats a missing one), but the
// same rule applied to a weekly would mean that on 14 August both the 7th's
// unsent occurrence and the 14th's new one are due — two emails the same
// morning. Because "the latest Friday whose 08:00 has passed" is unique at
// every instant, a failed Friday is retried by the hourly cron only until the
// next Friday 08:00 takes over, and is then abandoned.
//
// Restricting to Fridays of the CURRENT month also gives the month bound for
// free: on 1 September the latest passed Friday is 28 August, which is not in
// September's list, so nothing weekly is due until 4 September. That is
// correct — August is closed and the monthly summary covers it.
export function weeklyOccurrenceDay(
  year: number, month1: number, day: number, hour: number,
): number | null {
  const passed = fridaysInMonth(year, month1)
    .filter((f) => f < day || (f === day && hour >= SEND_HOUR_DUBAI));
  return passed.length > 0 ? passed[passed.length - 1] : null;
}

// How many weekly occurrences back a failed reminder keeps appearing in the
// outstanding-failure banner and the cron's outstanding count. Three weeks: a
// reminder that failed six weeks ago is not actionable and crowds out anything
// current. Aged-out rows are NOT deleted or hidden from the database — they
// stay in report_runs and are queryable, they simply stop being surfaced.
// Monthly summaries never age out: there are twelve a year and a missed month
// is always worth seeing.
export const BANNER_REMINDER_OCCURRENCES = 3;

export function bannerCutoffOccurrence(
  nowUtcMs: number, occurrences: number = BANNER_REMINDER_OCCURRENCES,
): string {
  const { ymd: today } = dubaiToday(nowUtcMs);
  const [y, m, d] = today.split('-').map(Number);
  // Date.UTC normalizes a negative day into the previous month/year, so no
  // manual month arithmetic is needed.
  const cutoff = new Date(Date.UTC(y, m - 1, d - occurrences * 7));
  return ymd(cutoff.getUTCFullYear(), cutoff.getUTCMonth() + 1, cutoff.getUTCDate());
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
        occurrence: ymd(y, m, 1),
        dueDate: ymd(y, m, 1),
        delayed: d > 1,
        rangeFromISO: dubaiMidnightISO(py, pm, 1),
        rangeToExclusiveISO: dubaiMidnightISO(y, m, 1),
      });
    }
  }

  // WEEKLY progress report for the CURRENT month: every Friday at 08:00 Dubai,
  // month-to-date. Replaces the old single reminder on day (lastDay-7).
  // weeklyOccurrenceDay() owns both the "which Friday" and the "how long do we
  // retry" questions — see its comment for why that bound is load-bearing.
  const occDay = weeklyOccurrenceDay(y, m, d, hour);
  const last = lastDayOfMonth(y, m);
  if (occDay !== null) {
    const period = `${y}-${pad(m)}`;
    if (period >= EARLIEST_PERIOD) {
      // Ruling: when the 1st of the month falls on a Friday, ONE email goes
      // out and it is the monthly summary — the summary fires once and cannot
      // be repeated, while the weekly comes round again in seven days.
      //
      // The condition is deliberately `occDay === 1` and NOT "is the monthly
      // summary also in `due`". The summary stays due for its ENTIRE month, so
      // keying off that would skip EVERY Friday of every month — the weekly
      // would never send at all. Only the calendar coincidence matters, and it
      // is rare: from 2026-08 the next one is 2027-01-01, then 2027-10-01.
      const summaryWinsToday = occDay === 1;
      const py = m === 1 ? y - 1 : y;
      const pm = m === 1 ? 12 : m - 1;
      due.push({
        reportType: 'reminder',
        period,
        occurrence: ymd(y, m, occDay),
        dueDate: ymd(y, m, occDay),
        delayed: d > occDay,
        rangeFromISO: dubaiMidnightISO(y, m, 1),
        // Month-to-date includes today, so the exclusive end is tomorrow, and
        // it is computed from the ACTUAL send day rather than the nominal
        // Friday: a Saturday retry then reports fresher data and the delayed
        // banner carries the original due date. d+1 can overflow the month, so
        // nextDayDubaiMidnightISO does real date arithmetic rather than
        // concatenating d+1 into an ISO literal.
        rangeToExclusiveISO: nextDayDubaiMidnightISO(y, m, d),
        daysLeftInMonth: last - d,
        daysElapsed: d,
        skipReason: summaryWinsToday
          ? `the ${py}-${pad(pm)} monthly summary is due the same morning and takes precedence`
          : undefined,
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
  daysElapsed?: number;
}

const OCCURRENCE_RE = /^20\d{2}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

// Resolves (and guards) the report_runs occurrence for an operator-triggered
// mode:'send'.
//
// THE COLLISION THIS PREVENTS. A manual reminder send writes a report_runs row
// keyed (reminder, occurrence). If that occurrence is a Friday the cron will
// later want, the cron finds the row already 'sent', skips it, and the
// scheduled Friday email never goes out — a manual send would have silently
// consumed a scheduled slot. So a reminder occurrence is only allowed when the
// cron provably can never claim it:
//
//   - period < EARLIEST_PERIOD — dueReports() suppresses that month entirely
//     (this is the actual use case: July 2026, the only month with real data),
//     or
//   - the period's month has already closed relative to today — the weekly
//     retry window is bounded to its own month, so the cron has given up on
//     every Friday in it.
//
// Otherwise it is refused with an explanation. The restriction is reminder-only
// on purpose: for a monthly summary, occupying the 1st-of-next-month slot is
// exactly the intended semantics of "send this period's summary now, once".
export function resolveSendOccurrence(
  report: 'monthly' | 'reminder',
  period: string,
  occurrenceParam: string | undefined,
  nowUtcMs: number,
): { occurrence: string } | { error: string } {
  const [y, m] = period.split('-').map(Number);

  if (report === 'monthly') {
    if (occurrenceParam !== undefined) {
      return { error: 'occurrence is not accepted for report:"monthly" — a monthly summary\'s occurrence is always the 1st of the following month.' };
    }
    const nextY = m === 12 ? y + 1 : y;
    const nextM = m === 12 ? 1 : m + 1;
    return { occurrence: `${nextY}-${pad(nextM)}-01` };
  }

  const { ymd: today } = dubaiToday(nowUtcMs);
  const todayMonth = today.slice(0, 7);
  const cronCouldStillClaim = period >= EARLIEST_PERIOD && todayMonth <= period;
  if (cronCouldStillClaim) {
    return {
      error: `Refusing to send a reminder for ${period}: the scheduler still owns that month's Fridays, and a manual send would occupy one of their report_runs slots so the scheduled email would never go out. `
        + `Use mode:"test" to preview it, or wait until ${period} has closed.`,
    };
  }

  const fridays = fridaysInMonth(y, m);
  if (fridays.length === 0) {
    // Unreachable for any real Gregorian month (every month contains at least
    // four Fridays); guarded rather than assumed so a bad period cannot index
    // into an empty array.
    return { error: `No Friday found in ${period}.` };
  }

  if (occurrenceParam === undefined) {
    return { occurrence: ymd(y, m, fridays[fridays.length - 1]) };
  }
  if (!OCCURRENCE_RE.test(occurrenceParam)) {
    return { error: 'occurrence must be YYYY-MM-DD with a real month and day (e.g. "2026-07-31").' };
  }
  if (occurrenceParam.slice(0, 7) !== period) {
    return { error: `occurrence ${occurrenceParam} is not inside period ${period}.` };
  }
  const day = Number(occurrenceParam.slice(8, 10));
  if (!fridays.includes(day)) {
    return {
      error: `occurrence ${occurrenceParam} is not a Friday. Fridays in ${period}: `
        + fridays.map((f) => `${period}-${pad(f)}`).join(', ') + '.',
    };
  }
  return { occurrence: occurrenceParam };
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
  // Pre-resolved and pre-validated by resolveSendOccurrence (which the caller
  // MUST run first — it is what refuses a reminder occurrence the scheduler
  // still owns). Doubles as the reminder's nominal due date, which is what the
  // deleted reminderDay() used to supply.
  occurrence: string,
): ResolvedTestReport & { delayed: boolean; occurrence: string } {
  const [y, m] = period.split('-').map(Number);
  const { ymd: today } = dubaiToday(nowUtcMs);

  if (report === 'monthly') {
    const nextY = m === 12 ? y + 1 : y;
    const nextM = m === 12 ? 1 : m + 1;
    const dueDate = `${nextY}-${pad(nextM)}-01`;
    return {
      reportType: 'monthly_summary',
      period,
      occurrence,
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
  // The occurrence IS the due date now. Previously this was
  // `reminderDay(y, m)` = lastDay-7, which no longer exists as a concept —
  // deleting it is a deliberate behaviour change to this mode's `delayed`
  // flag, not an accident.
  const dueDate = occurrence;
  return {
    reportType: 'reminder',
    period,
    occurrence,
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
    // For a closed month the whole month is covered, so "days elapsed" is the
    // full month; for the current month it is today. Drives the "day X of Y"
    // subject and the early-month note.
    daysElapsed: isCurrentMonth ? td : lastDayOfMonth(y, m),
  };
}
