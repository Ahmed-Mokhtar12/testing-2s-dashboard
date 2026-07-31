import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  dubaiToday, lastDayOfMonth, reminderDay, dueReports, nextDayDubaiMidnightISO, EARLIEST_PERIOD,
  resolveSendReport, monthLabel,
} from '../../supabase/functions/training-report/report-schedule.ts';

// 2026-08-01 04:00 UTC == 08:00 Dubai
const utc = (s: string) => Date.parse(s);

test('dubaiToday converts UTC to Dubai calendar day and hour', () => {
  assert.deepEqual(dubaiToday(utc('2026-07-31T21:30:00Z')), { ymd: '2026-08-01', hour: 1 });
  assert.deepEqual(dubaiToday(utc('2026-08-01T03:59:00Z')), { ymd: '2026-08-01', hour: 7 });
});

test('lastDayOfMonth handles 31/30/Feb/leap', () => {
  assert.equal(lastDayOfMonth(2026, 7), 31);
  assert.equal(lastDayOfMonth(2026, 6), 30);
  assert.equal(lastDayOfMonth(2026, 2), 28);
  assert.equal(lastDayOfMonth(2028, 2), 29);
});

test('reminderDay is lastDay minus 7', () => {
  assert.equal(reminderDay(2026, 7), 24);
  assert.equal(reminderDay(2026, 6), 23);
  assert.equal(reminderDay(2026, 2), 21);
  assert.equal(reminderDay(2028, 2), 22);
});

test('nextDayDubaiMidnightISO: mid-month has no rollover', () => {
  assert.equal(nextDayDubaiMidnightISO(2026, 7, 15), '2026-07-16T00:00:00+04:00');
});

test('nextDayDubaiMidnightISO: last day of a 31-day month rolls to next month', () => {
  assert.equal(nextDayDubaiMidnightISO(2026, 7, 31), '2026-08-01T00:00:00+04:00');
});

test('nextDayDubaiMidnightISO: last day of a 30-day month rolls to next month', () => {
  assert.equal(nextDayDubaiMidnightISO(2026, 6, 30), '2026-07-01T00:00:00+04:00');
});

test('nextDayDubaiMidnightISO: 28-Feb (non-leap) rolls to March', () => {
  assert.equal(nextDayDubaiMidnightISO(2026, 2, 28), '2026-03-01T00:00:00+04:00');
});

test('nextDayDubaiMidnightISO: 29-Feb (leap) rolls to March', () => {
  assert.equal(nextDayDubaiMidnightISO(2028, 2, 29), '2028-03-01T00:00:00+04:00');
});

test('nextDayDubaiMidnightISO: 31-Dec rolls to next year', () => {
  assert.equal(nextDayDubaiMidnightISO(2026, 12, 31), '2027-01-01T00:00:00+04:00');
});

// NOTE: this uses September 1st (-> period 2026-08), not August 1st
// (-> period 2026-07), because 2026-07 is before EARLIEST_PERIOD and is
// excluded — see the dedicated epoch-floor test below for that boundary.
test('monthly summary due on the 1st at 08:00 Dubai, not 07:59', () => {
  assert.equal(dueReports(utc('2026-09-01T03:59:00Z')).length, 0);
  const due = dueReports(utc('2026-09-01T04:00:00Z'));
  assert.equal(due.length, 1);
  assert.equal(due[0].reportType, 'monthly_summary');
  assert.equal(due[0].period, '2026-08');
  assert.equal(due[0].delayed, false);
  assert.equal(due[0].rangeFromISO, '2026-08-01T00:00:00+04:00');
  assert.equal(due[0].rangeToExclusiveISO, '2026-09-01T00:00:00+04:00');
});

// CHANGED expectation: the old 7-day grace window made the summary vanish on
// day 8. I3 widens this deliberately (report_runs already makes a duplicate
// send impossible, and a late report strictly dominates a missing one) —
// the summary now stays due for the rest of the month it's computed in, and
// only disappears once the calendar rolls past it (superseded by a NEW
// previous-month period, not "no longer due").
//
// CHANGED again for the A2 epoch floor: this now uses September/October
// (-> period 2026-08, then 2026-09) instead of August/September (-> period
// 2026-07, then 2026-08), because 2026-07 is before EARLIEST_PERIOD and
// would never appear in dueReports() at all.
test('monthly summary stays due (delayed) for the rest of the month; superseded once next month starts', () => {
  // Before September's own reminder window opens (rd=23): summary only.
  const d8 = dueReports(utc('2026-09-08T10:00:00Z'));
  assert.equal(d8.length, 1);
  assert.equal(d8[0].reportType, 'monthly_summary');
  assert.equal(d8[0].delayed, true);
  assert.equal(d8[0].period, '2026-08');

  // Last day of September (30 days): the summary is still due. September's
  // own reminder window has ALSO opened by now (rd=23), so both types are
  // due together — see the dedicated overlap test below; this assertion
  // only checks the summary side via find(), not the total count.
  const d30 = dueReports(utc('2026-09-30T10:00:00Z'));
  const summaryD30 = d30.find((r) => r.reportType === 'monthly_summary');
  assert.ok(summaryD30);
  assert.equal(summaryD30!.delayed, true);
  assert.equal(summaryD30!.period, '2026-08');

  const oct1Early = dueReports(utc('2026-10-01T03:59:00Z')); // 07:59 Dubai: day-1 gate not open yet
  assert.equal(oct1Early.length, 0);

  const oct1 = dueReports(utc('2026-10-01T04:00:00Z')); // 08:00 Dubai
  assert.equal(oct1.length, 1);
  assert.equal(oct1[0].period, '2026-09'); // superseded: now computing SEPTEMBER's summary, not August's
  assert.equal(oct1[0].delayed, false);
});

// CHANGED for the A2 epoch floor: uses August 24 (-> period 2026-08) instead
// of July 24 (-> period 2026-07, excluded entirely). This also satisfies the
// A2 gate-check (c): August's reminder is due on 2026-08-24 08:00 Dubai.
test('reminder due August 24 08:00 Dubai with month-to-date range and days left', () => {
  const due = dueReports(utc('2026-08-24T04:00:00Z'));
  // Unlike a post-epoch month, August 24 does NOT also trigger a summary:
  // August's previous month is July, which is before EARLIEST_PERIOD and is
  // excluded by the epoch floor — so this is the reminder alone.
  assert.equal(due.length, 1);
  assert.equal(due[0].reportType, 'reminder');
  assert.equal(due[0].period, '2026-08');
  assert.equal(due[0].dueDate, '2026-08-24');
  assert.equal(due[0].daysLeftInMonth, 7);
  assert.equal(due[0].rangeFromISO, '2026-08-01T00:00:00+04:00');
  // month-to-date: exclusive end = start of TOMORROW (Dubai)
  assert.equal(due[0].rangeToExclusiveISO, '2026-08-25T00:00:00+04:00');
});

// CHANGED expectation: the old 3-day grace window made the reminder vanish
// after day 27 (2026-07-28 at pastDue=4 was already gone). I3 widens this to
// the end of the reminder's own month (never later — a reminder is useless
// once its month has closed), so it now stays due all the way through the
// last day of the month, including the case that overflows
// rangeToExclusiveISO into the next month (exercising
// nextDayDubaiMidnightISO's rollover, per I1).
//
// CHANGED again for the A2 epoch floor: uses August (-> period 2026-08)
// instead of July (-> period 2026-07, excluded entirely). Because August's
// own previous month (July) is also excluded by the epoch floor, none of
// these dates overlap with a summary — no find()/filter() needed for the
// reminder side, unlike the July version of this test.
test('reminder stays due through month-end (widened window); gone once next month starts', () => {
  const d26 = dueReports(utc('2026-08-26T10:00:00Z'));
  assert.equal(d26.length, 1);
  assert.equal(d26[0].reportType, 'reminder');
  assert.equal(d26[0].delayed, true);
  assert.equal(d26[0].daysLeftInMonth, 5);

  const d28 = dueReports(utc('2026-08-28T10:00:00Z')); // previously gone under the old grace window
  assert.equal(d28.length, 1);
  assert.equal(d28[0].delayed, true);
  assert.equal(d28[0].daysLeftInMonth, 3);

  const d31 = dueReports(utc('2026-08-31T10:00:00Z')); // last day of August: still due
  assert.equal(d31.length, 1);
  assert.equal(d31[0].delayed, true);
  assert.equal(d31[0].daysLeftInMonth, 0);
  assert.equal(d31[0].rangeToExclusiveISO, '2026-09-01T00:00:00+04:00'); // rollover via nextDayDubaiMidnightISO

  // Once September starts, dueReports() is evaluating SEPTEMBER's own
  // reminder window (not due until day 23) — August's reminder is
  // superseded, not merely finished. (September's own summary, for the
  // in-scope period 2026-08, IS due at this instant — that's fine, this
  // assertion only checks the reminder side.)
  const sep1 = dueReports(utc('2026-09-01T10:00:00Z'));
  assert.equal(sep1.filter((r) => r.reportType === 'reminder').length, 0);
});

test('January rolls the monthly summary over to the previous December', () => {
  const due = dueReports(utc('2027-01-05T10:00:00Z'));
  const summary = due.find((r) => r.reportType === 'monthly_summary');
  assert.ok(summary);
  assert.equal(summary!.period, '2026-12');
  assert.equal(summary!.rangeFromISO, '2026-12-01T00:00:00+04:00');
  assert.equal(summary!.rangeToExclusiveISO, '2027-01-01T00:00:00+04:00');
});

// NEW: under the widened I3 windows, a summary and a reminder now genuinely
// CAN be due on the same day — every day from the reminder's due day through
// month-end, both windows overlap (the old narrow windows never let this
// happen: 7-day summary grace vs. day rd..rd+2 reminder grace never
// intersected within the same month for any real calendar).
//
// CHANGED for the A2 epoch floor: the earliest month where BOTH the
// reminder's own period AND its previous month clear EARLIEST_PERIOD is
// September (reminder period 2026-09, summary period 2026-08) — August
// can't show this because August's previous month, July, is excluded (see
// the August-only reminder test above). The original version of this test
// used 2026-07-30, which the epoch floor now excludes entirely (both
// periods involved, 2026-06 and 2026-07, are before EARLIEST_PERIOD) — see
// the dedicated epoch-floor test below, which asserts exactly that date
// returns [].
test('summary and reminder can both be due at once once both periods clear the epoch floor (widened windows overlap)', () => {
  const due = dueReports(utc('2026-09-25T10:00:00Z'));
  assert.equal(due.length, 2);
  assert.deepEqual(due.map((r) => r.reportType).sort(), ['monthly_summary', 'reminder']);
  const summary = due.find((r) => r.reportType === 'monthly_summary')!;
  assert.equal(summary.period, '2026-08');
  const reminder = due.find((r) => r.reportType === 'reminder')!;
  assert.equal(reminder.period, '2026-09');
});

// RENAMED from "both can be due at once (Feb 1 = summary day; never overlaps
// reminder) — and quiet days return []": that title asserted nothing about
// two-at-once (misleading) and its "quiet days" examples (July 30, July 15)
// are no longer quiet under the widened I3 windows on their own — both would
// be due (see the overlap test above) if not for the EARLIEST_PERIOD floor
// added in A2, which excludes both of those dates' periods outright (see the
// dedicated epoch-floor test below). Within an in-scope month, day 1 before
// the 08:00 Dubai gate opens is still always quiet, since a reminder can
// never be due on day 1 (reminderDay is always >= 21) and the summary's
// on-time gate hasn't opened yet — but it is no longer the ONLY quiet time,
// so this test's title no longer claims that.
test('day 1 before 08:00 Dubai is quiet, within an in-scope month', () => {
  assert.equal(dueReports(utc('2026-09-01T00:00:00Z')).length, 0); // 04:00 Dubai
});

// A2: no report is EVER due for a period before EARLIEST_PERIOD, no matter
// how far into its own retry window a candidate date falls. This is the
// fix for the live rollout risk flagged in fix-wave-A: with report_runs
// empty, 2026-07-30 previously made BOTH the June summary (all-zero — June
// has no training data) and the July reminder structurally due, which would
// have sent two unapproved, unreviewed production emails on the next real
// mode:'cron' invocation.
test('EARLIEST_PERIOD floor: nothing is ever due for 2026-07 or earlier', () => {
  assert.equal(EARLIEST_PERIOD, '2026-08');

  // (a) the exact situation flagged pre-fix: both the June summary and the
  // July reminder were structurally due here before this fix.
  assert.deepEqual(dueReports(utc('2026-07-30T10:00:00Z')), []);

  // (b) 2026-08-01 08:00 Dubai is the on-time gate for JULY's summary (the
  // previous month relative to August) — but July < EARLIEST_PERIOD, so the
  // epoch floor excludes it. August's own reminder isn't due until day 24
  // (see the August reminder test above), so this is genuinely quiet, not
  // merely "not due yet". Confirmed actual behaviour: dueReports returns [].
  assert.deepEqual(dueReports(utc('2026-08-01T04:00:00Z')), []);

  // (c) the August reminder IS due on 2026-08-24 08:00 Dubai — covered above
  // by 'reminder due August 24 08:00 Dubai with month-to-date range and
  // days left'.
  // (d) the September 1st summary for period 2026-08 IS due — covered above
  // by 'monthly summary due on the 1st at 08:00 Dubai, not 07:59'.
});

// --- M7: resolveSendReport (mode:'send' window/delayed/daysLeftInMonth) ----
// Moved here from index.ts (which cannot be unit-tested under Node because
// of its Deno `jsr:` imports) precisely so this — the newest, least-exercised
// date logic in the feature — gets automated coverage. Pure move, no
// behaviour change; see the follow-up fix report for confirmation.

test('resolveSendReport: monthly for a past period — full-month window, delayed, nominal due date = 1st of following month', () => {
  const r = resolveSendReport('monthly', '2026-06', utc('2026-09-15T10:00:00Z'));
  assert.equal(r.reportType, 'monthly_summary');
  assert.equal(r.period, '2026-06');
  assert.equal(r.periodLabel, 'June 2026');
  assert.equal(r.rangeFromISO, '2026-06-01T00:00:00+04:00');
  assert.equal(r.rangeToExclusiveISO, '2026-07-01T00:00:00+04:00');
  assert.equal(r.dueDate, '2026-07-01');
  assert.equal(r.delayed, true);
});

test('resolveSendReport: reminder for a past (non-current) period — full calendar month, delayed, daysLeftInMonth 0', () => {
  const r = resolveSendReport('reminder', '2026-06', utc('2026-09-15T10:00:00Z'));
  assert.equal(r.reportType, 'reminder');
  assert.equal(r.period, '2026-06');
  assert.equal(r.rangeFromISO, '2026-06-01T00:00:00+04:00');
  assert.equal(r.rangeToExclusiveISO, '2026-07-01T00:00:00+04:00');
  assert.equal(r.dueDate, '2026-06-23');
  assert.equal(r.delayed, true);
  assert.equal(r.daysLeftInMonth, 0);
});

test('resolveSendReport: reminder for the CURRENT month — month-to-date window ending start of tomorrow, real daysLeftInMonth', () => {
  const r = resolveSendReport('reminder', '2026-08', utc('2026-08-10T10:00:00Z'));
  assert.equal(r.reportType, 'reminder');
  assert.equal(r.period, '2026-08');
  assert.equal(r.rangeFromISO, '2026-08-01T00:00:00+04:00');
  assert.equal(r.rangeToExclusiveISO, '2026-08-11T00:00:00+04:00'); // start of tomorrow, not month-end
  assert.equal(r.dueDate, '2026-08-24');
  assert.equal(r.delayed, false); // due day hasn't arrived yet
  assert.equal(r.daysLeftInMonth, 21);
});

test('resolveSendReport: monthly Dec->Jan rollover — different year for both nextY and dueDate', () => {
  const r = resolveSendReport('monthly', '2026-12', utc('2027-01-15T10:00:00Z'));
  assert.equal(r.period, '2026-12');
  assert.equal(r.rangeFromISO, '2026-12-01T00:00:00+04:00');
  assert.equal(r.rangeToExclusiveISO, '2027-01-01T00:00:00+04:00');
  assert.equal(r.dueDate, '2027-01-01');
  assert.equal(r.delayed, true);
});

test('resolveSendReport: reminder Dec->Jan rollover for a past, non-current period', () => {
  const r = resolveSendReport('reminder', '2026-12', utc('2027-01-10T10:00:00Z'));
  assert.equal(r.period, '2026-12');
  assert.equal(r.rangeFromISO, '2026-12-01T00:00:00+04:00');
  assert.equal(r.rangeToExclusiveISO, '2027-01-01T00:00:00+04:00');
  assert.equal(r.dueDate, '2026-12-24');
  assert.equal(r.delayed, true);
  assert.equal(r.daysLeftInMonth, 0);
});

test('resolveSendReport: reminder for the current month in February, non-leap year', () => {
  const r = resolveSendReport('reminder', '2026-02', utc('2026-02-20T10:00:00Z'));
  assert.equal(r.rangeToExclusiveISO, '2026-02-21T00:00:00+04:00');
  assert.equal(r.dueDate, '2026-02-21');
  assert.equal(r.delayed, false);
  assert.equal(r.daysLeftInMonth, 8);
});

test('resolveSendReport: reminder for the current month in February, leap year', () => {
  const r = resolveSendReport('reminder', '2028-02', utc('2028-02-20T10:00:00Z'));
  assert.equal(r.rangeToExclusiveISO, '2028-02-21T00:00:00+04:00');
  assert.equal(r.dueDate, '2028-02-22'); // one day later than the non-leap case: lastDayOfMonth is 29, not 28
  assert.equal(r.delayed, false);
  assert.equal(r.daysLeftInMonth, 9); // one more day left than the non-leap case
});

// M1: mode:'send' bypasses EARLIEST_PERIOD entirely, and isValidPeriod's
// `20\d{2}` floor still allows periods up to 2099-12 — so a period materially
// in the future IS reachable here, unlike dueReports()'s own periods. This
// documents that behaviour precisely (rather than the stale "always in the
// past in practice" comment this replaced): a future, non-current period
// still resolves to a normal, non-delayed, full-calendar-month window (an
// all-zero report, since nothing has happened yet) — reachable only because
// mode:'send' is itself gated behind admin auth + confirm:true.
test('resolveSendReport: a future period documents the M1 behaviour — reachable, not delayed, all-zero-eligible window', () => {
  const r = resolveSendReport('reminder', '2099-12', utc('2026-08-01T10:00:00Z'));
  assert.equal(r.period, '2099-12');
  assert.equal(r.rangeFromISO, '2099-12-01T00:00:00+04:00');
  assert.equal(r.rangeToExclusiveISO, '2100-01-01T00:00:00+04:00');
  assert.equal(r.dueDate, '2099-12-24');
  assert.equal(r.delayed, false);
  assert.equal(r.daysLeftInMonth, 0);
});

test('monthLabel formats a UTC month/year pair regardless of local runtime timezone', () => {
  assert.equal(monthLabel(2026, 6), 'June 2026');
  assert.equal(monthLabel(2027, 1), 'January 2027');
});
