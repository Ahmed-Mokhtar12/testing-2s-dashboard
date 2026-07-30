import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  dubaiToday, lastDayOfMonth, reminderDay, dueReports,
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

test('monthly summary stays due (delayed) through day 7, gone day 8', () => {
  const d5 = dueReports(utc('2026-08-05T10:00:00Z'));
  assert.equal(d5.length, 1);
  assert.equal(d5[0].delayed, true);
  assert.equal(dueReports(utc('2026-08-08T10:00:00Z')).length, 0);
});

test('reminder due July 24 08:00 Dubai with month-to-date range and days left', () => {
  const due = dueReports(utc('2026-07-24T04:00:00Z'));
  assert.equal(due.length, 1);
  assert.equal(due[0].reportType, 'reminder');
  assert.equal(due[0].period, '2026-07');
  assert.equal(due[0].dueDate, '2026-07-24');
  assert.equal(due[0].daysLeftInMonth, 7);
  assert.equal(due[0].rangeFromISO, '2026-07-01T00:00:00+04:00');
  // month-to-date: exclusive end = start of TOMORROW (Dubai)
  assert.equal(due[0].rangeToExclusiveISO, '2026-07-25T00:00:00+04:00');
});

test('reminder window closes after 3 days; daysLeft shrinks when delayed', () => {
  const d26 = dueReports(utc('2026-07-26T10:00:00Z'));
  assert.equal(d26.length, 1);
  assert.equal(d26[0].delayed, true);
  assert.equal(d26[0].daysLeftInMonth, 5);
  assert.equal(dueReports(utc('2026-07-27T10:00:00Z')).length, 0);
  assert.equal(dueReports(utc('2026-07-28T10:00:00Z')).length, 0);
});

test('both can be due at once (Feb 1 = summary day; never overlaps reminder) — and quiet days return []', () => {
  assert.equal(dueReports(utc('2026-07-30T10:00:00Z')).length, 0);
  assert.equal(dueReports(utc('2026-07-15T10:00:00Z')).length, 0);
});
