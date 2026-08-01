import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  dubaiToday, lastDayOfMonth, dueReports, nextDayDubaiMidnightISO, EARLIEST_PERIOD,
  resolveSendReport, resolveSendOccurrence, monthLabel,
  dubaiDayOfWeek, fridaysInMonth, weeklyOccurrenceDay,
  bannerCutoffOccurrence, BANNER_REMINDER_OCCURRENCES,
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

// reminderDay() (lastDay-7) is GONE — the reminder is weekly now. These are its
// replacements. Expected values cross-checked against the real Gregorian
// calendar, not against the implementation.
test('dubaiDayOfWeek: Friday is 5, and it reads the Dubai calendar date', () => {
  assert.equal(dubaiDayOfWeek(2026, 8, 7), 5);   // Fri 7 Aug 2026
  assert.equal(dubaiDayOfWeek(2026, 8, 8), 6);   // Sat
  assert.equal(dubaiDayOfWeek(2027, 1, 1), 5);   // Fri 1 Jan 2027 — the collision date
});

test('fridaysInMonth: four in a normal month, five when the calendar allows', () => {
  assert.deepEqual(fridaysInMonth(2026, 8), [7, 14, 21, 28]);
  assert.deepEqual(fridaysInMonth(2026, 9), [4, 11, 18, 25]);
  assert.deepEqual(fridaysInMonth(2026, 10), [2, 9, 16, 23, 30]); // five
  assert.deepEqual(fridaysInMonth(2027, 1), [1, 8, 15, 22, 29]);  // starts ON a Friday
  assert.deepEqual(fridaysInMonth(2026, 2), [6, 13, 20, 27]);
  assert.deepEqual(fridaysInMonth(2028, 2), [4, 11, 18, 25]);     // leap year
});

test('weeklyOccurrenceDay: the latest Friday whose 08:00 has passed, this month only', () => {
  // Before the first Friday of the month: nothing.
  assert.equal(weeklyOccurrenceDay(2026, 8, 1, 23), null);
  assert.equal(weeklyOccurrenceDay(2026, 8, 6, 23), null);
  // On the first Friday, the 08:00 gate is what flips it.
  assert.equal(weeklyOccurrenceDay(2026, 8, 7, 7), null);
  assert.equal(weeklyOccurrenceDay(2026, 8, 7, 8), 7);
  // Mid-week it stays on the last Friday that passed…
  assert.equal(weeklyOccurrenceDay(2026, 8, 10, 12), 7);
  assert.equal(weeklyOccurrenceDay(2026, 8, 13, 23), 7);
  // …and hands over at the next Friday 08:00, which is what bounds the retry
  // window and makes two weeklies impossible at once.
  assert.equal(weeklyOccurrenceDay(2026, 8, 14, 7), 7);
  assert.equal(weeklyOccurrenceDay(2026, 8, 14, 8), 14);
  // Last Friday holds to month end.
  assert.equal(weeklyOccurrenceDay(2026, 8, 31, 23), 28);
});

test('bannerCutoffOccurrence: three weekly occurrences back, crossing a month boundary', () => {
  assert.equal(BANNER_REMINDER_OCCURRENCES, 3);
  assert.equal(bannerCutoffOccurrence(utc('2026-08-28T10:00:00Z')), '2026-08-07');
  // 21 days before 3 September is 13 August — Date.UTC normalizes the
  // negative day rather than needing month arithmetic.
  assert.equal(bannerCutoffOccurrence(utc('2026-09-03T10:00:00Z')), '2026-08-13');
  // …and across a year boundary.
  assert.equal(bannerCutoffOccurrence(utc('2027-01-08T10:00:00Z')), '2026-12-18');
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
  // CHANGED for the weekly cadence: 8 September is a Tuesday and Friday the
  // 4th has already passed, so the weekly is due here too — under the old
  // lastDay-7 rule this date was summary-only.
  const d8 = dueReports(utc('2026-09-08T10:00:00Z'));
  assert.equal(d8.length, 2);
  const summaryD8 = d8.find((r) => r.reportType === 'monthly_summary')!;
  assert.equal(summaryD8.delayed, true);
  assert.equal(summaryD8.period, '2026-08');
  assert.equal(summaryD8.occurrence, '2026-09-01');

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

// WEEKLY CADENCE (replaces the two lastDay-7 reminder tests). August 2026's
// Fridays are 7, 14, 21, 28 and August's previous month is July, which the
// epoch floor excludes — so every date below is the weekly alone, with no
// summary to filter out.
test('weekly: due every Friday at 08:00 Dubai, not 07:59, with month-to-date range', () => {
  assert.deepEqual(dueReports(utc('2026-08-07T03:59:00Z')), []); // 07:59 Dubai
  const due = dueReports(utc('2026-08-07T04:00:00Z'));           // 08:00 Dubai
  assert.equal(due.length, 1);
  assert.equal(due[0].reportType, 'reminder');
  assert.equal(due[0].period, '2026-08');
  assert.equal(due[0].occurrence, '2026-08-07');
  assert.equal(due[0].dueDate, '2026-08-07');
  assert.equal(due[0].delayed, false);
  assert.equal(due[0].daysElapsed, 7);
  assert.equal(due[0].daysLeftInMonth, 24);
  assert.equal(due[0].rangeFromISO, '2026-08-01T00:00:00+04:00');
  assert.equal(due[0].rangeToExclusiveISO, '2026-08-08T00:00:00+04:00');
  assert.equal(due[0].skipReason, undefined);
});

// THE REGRESSION THAT MOTIVATED THE occurrence KEY. report_runs used to be
// keyed (report_type, period), so all four of these would have collided on
// ('reminder','2026-08'): the 7th sets status='sent' and claimRun then refuses
// the 14th, 21st and 28th as already-sent — the weekly silently degrading to
// monthly while the cron reported success. Four DISTINCT occurrences is the
// property that prevents it, so it is asserted directly.
test('weekly: all four August Fridays are distinct occurrences under one period', () => {
  const occurrences = [7, 14, 21, 28].map((d) => {
    const due = dueReports(utc(`2026-08-${String(d).padStart(2, '0')}T04:00:00Z`));
    assert.equal(due.length, 1, `expected exactly one report due on 2026-08-${d}`);
    assert.equal(due[0].period, '2026-08');
    assert.equal(due[0].daysElapsed, d);
    return due[0].occurrence;
  });
  assert.deepEqual(occurrences, ['2026-08-07', '2026-08-14', '2026-08-21', '2026-08-28']);
  assert.equal(new Set(occurrences).size, 4);
});

// The retry bound. A weekly that fails is retried by the hourly cron until the
// NEXT Friday 08:00 and then abandoned — never overlapping, because
// weeklyOccurrenceDay returns exactly one Friday at any instant.
test('weekly: a failed Friday is retried until the next Friday 08:00, then handed over', () => {
  // Saturday after: still the 7th's occurrence, now flagged delayed, and the
  // window has widened to include Saturday's data.
  const sat = dueReports(utc('2026-08-08T10:00:00Z'));
  assert.equal(sat.length, 1);
  assert.equal(sat[0].occurrence, '2026-08-07');
  assert.equal(sat[0].delayed, true);
  assert.equal(sat[0].daysElapsed, 8);
  assert.equal(sat[0].rangeToExclusiveISO, '2026-08-09T00:00:00+04:00');

  // Next Friday 07:59 Dubai — still the 7th's slot.
  assert.equal(dueReports(utc('2026-08-14T03:59:00Z'))[0].occurrence, '2026-08-07');
  // Next Friday 08:00 — handed over, and never both at once.
  const handover = dueReports(utc('2026-08-14T04:00:00Z'));
  assert.equal(handover.length, 1);
  assert.equal(handover[0].occurrence, '2026-08-14');
  assert.equal(handover[0].delayed, false);
});

test('weekly: the last Friday holds to month end, with the range rolling into next month', () => {
  const d31 = dueReports(utc('2026-08-31T10:00:00Z'));
  assert.equal(d31.length, 1);
  assert.equal(d31[0].occurrence, '2026-08-28');
  assert.equal(d31[0].delayed, true);
  assert.equal(d31[0].daysElapsed, 31);
  assert.equal(d31[0].daysLeftInMonth, 0);
  assert.equal(d31[0].rangeToExclusiveISO, '2026-09-01T00:00:00+04:00'); // nextDayDubaiMidnightISO rollover
});

// The month bound, which is what stops an "August month-to-date" weekly going
// out in September. 1-3 September are Tue-Thu; the latest Friday that passed is
// 28 August, which is not one of September's Fridays, so no weekly is due until
// Friday the 4th. The September 1st SUMMARY is due on those days — asserted
// here too, so this cannot pass by everything being quiet.
test('weekly: nothing weekly until the first Friday of a new month, while the summary does fire', () => {
  for (const day of ['01', '02', '03']) {
    const due = dueReports(utc(`2026-09-${day}T10:00:00Z`));
    assert.equal(due.filter((r) => r.reportType === 'reminder').length, 0, `2026-09-${day} should have no weekly`);
    assert.equal(due.filter((r) => r.reportType === 'monthly_summary').length, 1, `2026-09-${day} should have the summary`);
  }
  const firstFriday = dueReports(utc('2026-09-04T04:00:00Z'));
  const weekly = firstFriday.find((r) => r.reportType === 'reminder')!;
  assert.ok(weekly);
  assert.equal(weekly.occurrence, '2026-09-04');
  assert.equal(weekly.daysElapsed, 4);
});

// A five-Friday month: October 2026 (2, 9, 16, 23, 30). Nothing special is
// supposed to happen, which is exactly why it is pinned — an off-by-one in
// fridaysInMonth would show up here first.
test('weekly: a five-Friday month produces five distinct occurrences', () => {
  const occurrences = [2, 9, 16, 23, 30].map((d) => {
    const due = dueReports(utc(`2026-10-${String(d).padStart(2, '0')}T04:00:00Z`));
    const weekly = due.find((r) => r.reportType === 'reminder')!;
    assert.ok(weekly, `expected a weekly on 2026-10-${d}`);
    return weekly.occurrence;
  });
  assert.deepEqual(occurrences, ['2026-10-02', '2026-10-09', '2026-10-16', '2026-10-23', '2026-10-30']);
});

// RULING: when the 1st of the month falls on a Friday, ONE email goes out and
// it is the monthly summary; that Friday's weekly is recorded as skipped rather
// than left looking like a missed send. The next such date after launch is
// 2027-01-01, five months out — the calendar cannot demonstrate this before
// then, so the test is the only thing that can.
test('weekly: when the 1st is a Friday, the summary wins and the weekly carries a skip reason', () => {
  const due = dueReports(utc('2027-01-01T04:00:00Z')); // Fri 1 Jan 2027, 08:00 Dubai
  assert.equal(due.length, 2);

  const summary = due.find((r) => r.reportType === 'monthly_summary')!;
  assert.equal(summary.period, '2026-12');
  assert.equal(summary.occurrence, '2027-01-01');
  assert.equal(summary.skipReason, undefined, 'the summary must never be the one skipped');

  const weekly = due.find((r) => r.reportType === 'reminder')!;
  assert.equal(weekly.period, '2027-01');
  assert.equal(weekly.occurrence, '2027-01-01');
  assert.ok(weekly.skipReason, 'the weekly must carry a reason so the ledger gap is explained');
  assert.match(weekly.skipReason!, /2026-12 monthly summary/);
});

// The skip must be keyed on the CALENDAR (occurrence day === 1), never on
// "is the summary also due" — the summary stays due for its whole month, so the
// latter would skip EVERY Friday of every month and the weekly would never send
// at all. This is the guard against that, and it is the failure mode that would
// have been hardest to notice: silent, total, and reported as success.
test('weekly: later Fridays of a month whose 1st was a Friday are NOT skipped', () => {
  for (const d of [8, 15, 22, 29]) {
    const due = dueReports(utc(`2027-01-${String(d).padStart(2, '0')}T04:00:00Z`));
    const weekly = due.find((r) => r.reportType === 'reminder')!;
    assert.ok(weekly, `expected a weekly on 2027-01-${d}`);
    assert.equal(weekly.skipReason, undefined, `2027-01-${d} must not be skipped`);
    // …while the December summary is still due all month, proving the summary's
    // presence genuinely does overlap these dates.
    assert.equal(due.filter((r) => r.reportType === 'monthly_summary').length, 1);
  }
});

// report-html recovers the month length as daysElapsed + daysLeftInMonth rather
// than doing calendar arithmetic of its own (that module is deliberately
// calendar-free). That is an implicit contract between two files, so it is
// pinned across every producer of those two numbers.
test('daysElapsed + daysLeftInMonth always equals the month length', () => {
  for (const [instant, y, m] of [
    ['2026-08-07T04:00:00Z', 2026, 8],
    ['2026-08-31T10:00:00Z', 2026, 8],
    ['2026-09-04T04:00:00Z', 2026, 9],
    ['2026-10-30T04:00:00Z', 2026, 10],
    ['2027-01-29T04:00:00Z', 2027, 1],
  ] as [string, number, number][]) {
    const weekly = dueReports(utc(instant)).find((r) => r.reportType === 'reminder')!;
    assert.ok(weekly, `expected a weekly at ${instant}`);
    assert.equal(
      (weekly.daysElapsed ?? 0) + (weekly.daysLeftInMonth ?? 0),
      lastDayOfMonth(y, m),
      `day sum must equal the length of ${y}-${m} at ${instant}`,
    );
  }
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
test('summary and weekly can both be due at once, on distinct occurrences', () => {
  const due = dueReports(utc('2026-09-25T10:00:00Z')); // Fri 25 Sep 2026
  assert.equal(due.length, 2);
  assert.deepEqual(due.map((r) => r.reportType).sort(), ['monthly_summary', 'reminder']);
  const summary = due.find((r) => r.reportType === 'monthly_summary')!;
  assert.equal(summary.period, '2026-08');
  assert.equal(summary.occurrence, '2026-09-01');
  const weekly = due.find((r) => r.reportType === 'reminder')!;
  assert.equal(weekly.period, '2026-09');
  assert.equal(weekly.occurrence, '2026-09-25');
  // Both due, NEITHER skipped: the skip rule is "the 1st is a Friday", not
  // "the summary is also due" — the summary is due every day of its month.
  assert.equal(summary.skipReason, undefined);
  assert.equal(weekly.skipReason, undefined);
  // Different primary keys, so the ledger holds both.
  assert.notEqual(`${summary.reportType}/${summary.occurrence}`, `${weekly.reportType}/${weekly.occurrence}`);
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
//
// CHANGED for the weekly cadence: the reason day 1 has no weekly is no longer
// "reminderDay is always >= 21" (that function is gone) but that 1 September
// 2026 is a Tuesday and no Friday of September has passed yet. On a month whose
// 1st IS a Friday the weekly does surface on day 1 — and is skipped; see the
// 2027-01-01 test.
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
  // epoch floor excludes it. 1 August 2026 is a Saturday and August's first
  // Friday is the 7th, so there is no weekly either: genuinely quiet, not
  // merely "not due yet". Confirmed actual behaviour: dueReports returns [].
  assert.deepEqual(dueReports(utc('2026-08-01T04:00:00Z')), []);

  // (c) every July 2026 Friday is suppressed too, even deep into what would be
  // its retry window — the floor is on the PERIOD, so the weekly cadence does
  // not widen the epoch hole.
  for (const d of ['03', '10', '17', '24', '31']) {
    assert.deepEqual(dueReports(utc(`2026-07-${d}T04:00:00Z`)), [], `2026-07-${d} must be suppressed`);
  }

  // (d) the first in-scope weekly is 2026-08-07 — covered above by
  // 'weekly: due every Friday at 08:00 Dubai, not 07:59, with month-to-date
  // range'.
  // (e) the September 1st summary for period 2026-08 IS due — covered above
  // by 'monthly summary due on the 1st at 08:00 Dubai, not 07:59'.
});

// --- M7: resolveSendReport (mode:'send' window/delayed/daysLeftInMonth) ----
// Moved here from index.ts (which cannot be unit-tested under Node because
// of its Deno `jsr:` imports) precisely so this — the newest, least-exercised
// date logic in the feature — gets automated coverage. Pure move, no
// behaviour change; see the follow-up fix report for confirmation.

// CHANGED for the weekly cadence: resolveSendReport now takes the occurrence as
// its fourth argument. reminderDay() (lastDay-7) is gone, so a reminder's
// nominal dueDate — the only thing that drives the delayed banner — IS the
// occurrence. That is a deliberate behaviour change to this mode, not a slip:
// the old dueDate no longer corresponds to anything the scheduler does.
// resolveSendOccurrence is the thing that produces (and refuses) these values;
// its own tests are below.

test('resolveSendReport: monthly for a past period — full-month window, delayed, nominal due date = 1st of following month', () => {
  const r = resolveSendReport('monthly', '2026-06', utc('2026-09-15T10:00:00Z'), '2026-07-01');
  assert.equal(r.reportType, 'monthly_summary');
  assert.equal(r.period, '2026-06');
  assert.equal(r.periodLabel, 'June 2026');
  assert.equal(r.rangeFromISO, '2026-06-01T00:00:00+04:00');
  assert.equal(r.rangeToExclusiveISO, '2026-07-01T00:00:00+04:00');
  assert.equal(r.dueDate, '2026-07-01');
  assert.equal(r.delayed, true);
});

test('resolveSendReport: reminder for a past (non-current) period — full calendar month, delayed, daysLeftInMonth 0', () => {
  const r = resolveSendReport('reminder', '2026-06', utc('2026-09-15T10:00:00Z'), '2026-06-26');
  assert.equal(r.reportType, 'reminder');
  assert.equal(r.period, '2026-06');
  assert.equal(r.rangeFromISO, '2026-06-01T00:00:00+04:00');
  assert.equal(r.rangeToExclusiveISO, '2026-07-01T00:00:00+04:00');
  assert.equal(r.dueDate, '2026-06-26');  // the occurrence, not lastDay-7
  assert.equal(r.occurrence, '2026-06-26');
  assert.equal(r.delayed, true);
  assert.equal(r.daysLeftInMonth, 0);
  assert.equal(r.daysElapsed, 30);        // a closed month is fully elapsed
});

test('resolveSendReport: reminder for the CURRENT month — month-to-date window ending start of tomorrow, real daysLeftInMonth', () => {
  const r = resolveSendReport('reminder', '2026-08', utc('2026-08-10T10:00:00Z'), '2026-08-28');
  assert.equal(r.reportType, 'reminder');
  assert.equal(r.period, '2026-08');
  assert.equal(r.rangeFromISO, '2026-08-01T00:00:00+04:00');
  assert.equal(r.rangeToExclusiveISO, '2026-08-11T00:00:00+04:00'); // start of tomorrow, not month-end
  assert.equal(r.dueDate, '2026-08-28');
  assert.equal(r.delayed, false); // occurrence hasn't arrived yet
  assert.equal(r.daysLeftInMonth, 21);
  assert.equal(r.daysElapsed, 10);
});

test('resolveSendReport: monthly Dec->Jan rollover — different year for both nextY and dueDate', () => {
  const r = resolveSendReport('monthly', '2026-12', utc('2027-01-15T10:00:00Z'), '2027-01-01');
  assert.equal(r.period, '2026-12');
  assert.equal(r.rangeFromISO, '2026-12-01T00:00:00+04:00');
  assert.equal(r.rangeToExclusiveISO, '2027-01-01T00:00:00+04:00');
  assert.equal(r.dueDate, '2027-01-01');
  assert.equal(r.delayed, true);
});

test('resolveSendReport: reminder Dec->Jan rollover for a past, non-current period', () => {
  const r = resolveSendReport('reminder', '2026-12', utc('2027-01-10T10:00:00Z'), '2026-12-25');
  assert.equal(r.period, '2026-12');
  assert.equal(r.rangeFromISO, '2026-12-01T00:00:00+04:00');
  assert.equal(r.rangeToExclusiveISO, '2027-01-01T00:00:00+04:00');
  assert.equal(r.dueDate, '2026-12-25');
  assert.equal(r.delayed, true);
  assert.equal(r.daysLeftInMonth, 0);
});

test('resolveSendReport: reminder for the current month in February, non-leap year', () => {
  const r = resolveSendReport('reminder', '2026-02', utc('2026-02-20T10:00:00Z'), '2026-02-27');
  assert.equal(r.rangeToExclusiveISO, '2026-02-21T00:00:00+04:00');
  assert.equal(r.dueDate, '2026-02-27');
  assert.equal(r.delayed, false);
  assert.equal(r.daysLeftInMonth, 8);
});

test('resolveSendReport: reminder for the current month in February, leap year', () => {
  const r = resolveSendReport('reminder', '2028-02', utc('2028-02-20T10:00:00Z'), '2028-02-25');
  assert.equal(r.rangeToExclusiveISO, '2028-02-21T00:00:00+04:00');
  assert.equal(r.dueDate, '2028-02-25');
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
  const r = resolveSendReport('reminder', '2099-12', utc('2026-08-01T10:00:00Z'), '2099-12-25');
  assert.equal(r.period, '2099-12');
  assert.equal(r.rangeFromISO, '2099-12-01T00:00:00+04:00');
  assert.equal(r.rangeToExclusiveISO, '2100-01-01T00:00:00+04:00');
  assert.equal(r.dueDate, '2099-12-25');
  assert.equal(r.delayed, false);
  assert.equal(r.daysLeftInMonth, 0);
});

// --- resolveSendOccurrence: the manual-send collision guard -----------------
// A manual reminder send writes a report_runs row keyed (reminder, occurrence).
// If that occurrence is a Friday the scheduler will later want, the cron finds
// the row already 'sent', skips it, and the scheduled Friday email never goes
// out — a manual send silently consuming a scheduled slot. These tests pin the
// refusal, because the symptom of getting it wrong is a missing email, which is
// invisible.

test('resolveSendOccurrence: refuses a reminder the scheduler still owns', () => {
  // Current month, at or after the epoch floor: the cron owns every Friday in
  // it, so a manual send is refused outright.
  const cur = resolveSendOccurrence('reminder', '2026-08', undefined, utc('2026-08-10T10:00:00Z'));
  assert.ok('error' in cur);
  assert.match((cur as { error: string }).error, /still owns that month's Fridays/);

  // A FUTURE in-scope month is refused for the same reason.
  const future = resolveSendOccurrence('reminder', '2026-12', undefined, utc('2026-08-10T10:00:00Z'));
  assert.ok('error' in future);

  // Explicitly naming the occurrence does not get you past it.
  const explicit = resolveSendOccurrence('reminder', '2026-08', '2026-08-07', utc('2026-08-10T10:00:00Z'));
  assert.ok('error' in explicit);
});

test('resolveSendOccurrence: allows a reminder the scheduler can never claim', () => {
  // (a) below the epoch floor — dueReports() suppresses the month entirely.
  // This is the real use case: July 2026, the only month with training data.
  const july = resolveSendOccurrence('reminder', '2026-07', undefined, utc('2026-08-01T10:00:00Z'));
  assert.deepEqual(july, { occurrence: '2026-07-31' }); // last Friday of July 2026

  // (b) a month that has closed — the weekly retry window is bounded to its own
  // month, so the cron has given up on every Friday in it.
  const closed = resolveSendOccurrence('reminder', '2026-08', undefined, utc('2026-09-03T10:00:00Z'));
  assert.deepEqual(closed, { occurrence: '2026-08-28' });

  // An explicit Friday inside a closed month is honoured.
  const explicit = resolveSendOccurrence('reminder', '2026-08', '2026-08-14', utc('2026-09-03T10:00:00Z'));
  assert.deepEqual(explicit, { occurrence: '2026-08-14' });
});

test('resolveSendOccurrence: rejects malformed, out-of-period and non-Friday occurrences', () => {
  const now = utc('2026-09-03T10:00:00Z');
  assert.match((resolveSendOccurrence('reminder', '2026-08', '2026-8-7', now) as { error: string }).error, /YYYY-MM-DD/);
  assert.match((resolveSendOccurrence('reminder', '2026-08', '2026-08-32', now) as { error: string }).error, /YYYY-MM-DD/);
  assert.match((resolveSendOccurrence('reminder', '2026-08', '2026-07-31', now) as { error: string }).error, /not inside period/);
  // 2026-08-10 is a Monday. The error lists the real Fridays so the operator can
  // fix it without going to a calendar.
  const notFriday = resolveSendOccurrence('reminder', '2026-08', '2026-08-10', now) as { error: string };
  assert.match(notFriday.error, /is not a Friday/);
  assert.match(notFriday.error, /2026-08-07, 2026-08-14, 2026-08-21, 2026-08-28/);
});

// The restriction is reminder-only ON PURPOSE. For a monthly summary, occupying
// the 1st-of-next-month slot is exactly what "send this period's summary now,
// once" means — the report_runs row is the thing that stops it going twice.
test('resolveSendOccurrence: monthly derives the 1st of the following month and takes no override', () => {
  assert.deepEqual(resolveSendOccurrence('monthly', '2026-07', undefined, utc('2026-08-01T10:00:00Z')), { occurrence: '2026-08-01' });
  assert.deepEqual(resolveSendOccurrence('monthly', '2026-12', undefined, utc('2027-02-01T10:00:00Z')), { occurrence: '2027-01-01' });
  // Even for the CURRENT month — no ownership check, unlike reminder.
  assert.deepEqual(resolveSendOccurrence('monthly', '2026-09', undefined, utc('2026-09-20T10:00:00Z')), { occurrence: '2026-10-01' });
  const override = resolveSendOccurrence('monthly', '2026-07', '2026-08-01', utc('2026-08-01T10:00:00Z'));
  assert.ok('error' in override);
  assert.match((override as { error: string }).error, /not accepted for report:"monthly"/);
});

test('monthLabel formats a UTC month/year pair regardless of local runtime timezone', () => {
  assert.equal(monthLabel(2026, 6), 'June 2026');
  assert.equal(monthLabel(2027, 1), 'January 2027');
});
