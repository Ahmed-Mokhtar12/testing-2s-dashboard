import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  dubaiToday, lastDayOfMonth, reminderDay, dueReports, nextDayDubaiMidnightISO,
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

test('monthly summary due on the 1st at 08:00 Dubai, not 07:59', () => {
  assert.equal(dueReports(utc('2026-08-01T03:59:00Z')).length, 0);
  const due = dueReports(utc('2026-08-01T04:00:00Z'));
  assert.equal(due.length, 1);
  assert.equal(due[0].reportType, 'monthly_summary');
  assert.equal(due[0].period, '2026-07');
  assert.equal(due[0].delayed, false);
  assert.equal(due[0].rangeFromISO, '2026-07-01T00:00:00+04:00');
  assert.equal(due[0].rangeToExclusiveISO, '2026-08-01T00:00:00+04:00');
});

// CHANGED expectation: the old 7-day grace window made the summary vanish on
// day 8. I3 widens this deliberately (report_runs already makes a duplicate
// send impossible, and a late report strictly dominates a missing one) —
// the summary now stays due for the rest of the month it's computed in, and
// only disappears once the calendar rolls past it (superseded by a NEW
// previous-month period, not "no longer due").
test('monthly summary stays due (delayed) for the rest of the month; superseded once next month starts', () => {
  // Before August's own reminder window opens (rd=24): summary only.
  const d8 = dueReports(utc('2026-08-08T10:00:00Z'));
  assert.equal(d8.length, 1);
  assert.equal(d8[0].reportType, 'monthly_summary');
  assert.equal(d8[0].delayed, true);
  assert.equal(d8[0].period, '2026-07');

  // Last day of August: the summary is still due. August's own reminder
  // window has ALSO opened by now (rd=24), so both types are due together —
  // see the dedicated overlap test below; this assertion only checks the
  // summary side via find(), not the total count.
  const d31 = dueReports(utc('2026-08-31T10:00:00Z'));
  const summaryD31 = d31.find((r) => r.reportType === 'monthly_summary');
  assert.ok(summaryD31);
  assert.equal(summaryD31!.delayed, true);
  assert.equal(summaryD31!.period, '2026-07');

  const sep1Early = dueReports(utc('2026-09-01T03:59:00Z')); // 07:59 Dubai: day-1 gate not open yet
  assert.equal(sep1Early.length, 0);

  const sep1 = dueReports(utc('2026-09-01T04:00:00Z')); // 08:00 Dubai
  assert.equal(sep1.length, 1);
  assert.equal(sep1[0].period, '2026-08'); // superseded: now computing AUGUST's summary, not July's
  assert.equal(sep1[0].delayed, false);
});

test('reminder due July 24 08:00 Dubai with month-to-date range and days left', () => {
  const due = dueReports(utc('2026-07-24T04:00:00Z'));
  // July 24 also falls within June's summary due window (any day > 1), so
  // both report types are due together here — see the overlap test below.
  // This test only asserts the reminder side, via find().
  const reminder = due.find((r) => r.reportType === 'reminder');
  assert.ok(reminder);
  assert.equal(reminder!.period, '2026-07');
  assert.equal(reminder!.dueDate, '2026-07-24');
  assert.equal(reminder!.daysLeftInMonth, 7);
  assert.equal(reminder!.rangeFromISO, '2026-07-01T00:00:00+04:00');
  // month-to-date: exclusive end = start of TOMORROW (Dubai)
  assert.equal(reminder!.rangeToExclusiveISO, '2026-07-25T00:00:00+04:00');
});

// CHANGED expectation: the old 3-day grace window made the reminder vanish
// after day 27 (2026-07-28 at pastDue=4 was already gone). I3 widens this to
// the end of the reminder's own month (never later — a reminder is useless
// once its month has closed), so it now stays due all the way through the
// last day of July, including the case that overflows rangeToExclusiveISO
// into August (exercising nextDayDubaiMidnightISO's rollover, per I1).
test('reminder stays due through month-end (widened window); gone once next month starts', () => {
  // All three dates below also fall within July's own summary-for-June due
  // window (day > 1), so each returns 2 entries — assertions below use
  // find() to isolate the reminder side; the overlap itself is covered by
  // the dedicated overlap test.
  const d26 = dueReports(utc('2026-07-26T10:00:00Z'));
  const reminderD26 = d26.find((r) => r.reportType === 'reminder');
  assert.ok(reminderD26);
  assert.equal(reminderD26!.delayed, true);
  assert.equal(reminderD26!.daysLeftInMonth, 5);

  const d28 = dueReports(utc('2026-07-28T10:00:00Z')); // previously gone under the old grace window
  const reminderD28 = d28.find((r) => r.reportType === 'reminder');
  assert.ok(reminderD28);
  assert.equal(reminderD28!.delayed, true);
  assert.equal(reminderD28!.daysLeftInMonth, 3);

  const d31 = dueReports(utc('2026-07-31T10:00:00Z')); // last day of July: still due
  const reminderD31 = d31.find((r) => r.reportType === 'reminder');
  assert.ok(reminderD31);
  assert.equal(reminderD31!.delayed, true);
  assert.equal(reminderD31!.daysLeftInMonth, 0);
  assert.equal(reminderD31!.rangeToExclusiveISO, '2026-08-01T00:00:00+04:00'); // rollover via nextDayDubaiMidnightISO

  // Once August starts, dueReports() is evaluating AUGUST's own reminder
  // window (not due until day 24) — July's reminder is superseded, not
  // merely finished.
  const aug1 = dueReports(utc('2026-08-01T10:00:00Z'));
  assert.equal(aug1.filter((r) => r.reportType === 'reminder').length, 0);
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
test('summary and reminder can both be due at once once the reminder window opens (widened windows overlap)', () => {
  const due = dueReports(utc('2026-07-30T10:00:00Z'));
  assert.equal(due.length, 2);
  assert.deepEqual(due.map((r) => r.reportType).sort(), ['monthly_summary', 'reminder']);
  const summary = due.find((r) => r.reportType === 'monthly_summary')!;
  assert.equal(summary.period, '2026-06');
  const reminder = due.find((r) => r.reportType === 'reminder')!;
  assert.equal(reminder.period, '2026-07');
});

// RENAMED from "both can be due at once (Feb 1 = summary day; never overlaps
// reminder) — and quiet days return []": that title asserted nothing about
// two-at-once (misleading) and its "quiet days" examples (July 30, July 15)
// are no longer quiet under the widened I3 windows — both are now due (see
// the overlap test above). The only quiet time left under the new rules is
// day 1 before the 08:00 Dubai gate opens, since a reminder can never be due
// on day 1 (reminderDay is always >= 21) and the summary's on-time gate has
// not opened yet.
test('day 1 before 08:00 Dubai is the only quiet time left', () => {
  assert.equal(dueReports(utc('2026-08-01T00:00:00Z')).length, 0); // 04:00 Dubai
});
