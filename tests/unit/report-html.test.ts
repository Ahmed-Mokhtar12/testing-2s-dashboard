import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderReportEmail } from '../../supabase/functions/training-report/report-html.ts';

const row = (over = {}) => ({
  department: 'Front Office', trainers: 2, colleagues: 10, manHours: 20,
  target: null, pctOfTarget: null, ...over,
});
const data = (over = {}) => ({
  rows: [row(), row({ department: 'Kitchen', trainers: 0, colleagues: 0, manHours: 0 })],
  totals: { sessions: 3, trainers: 2, colleagues: 10, manHours: 20 },
  anyTargetSet: false,
  dataQualityNote: null,
  ...over,
});

test('summary email: table rows incl. zero row, dark-console styling, no target columns when none set', () => {
  const { subject, html } = renderReportEmail({
    reportType: 'monthly_summary', periodLabel: 'July 2026',
    data: data(), delayed: false, dueDate: '2026-08-01',
  });
  assert.equal(subject, '2S Monthly Training Summary — July 2026');
  assert.match(html, /Front Office/);
  assert.match(html, /Kitchen/);            // zero row visible
  assert.match(html, /#0b1628/);            // card background = reviews-email family
  assert.match(html, /Hotel Training Console/);
  assert.doesNotMatch(html, /Target/);
});

// CHANGED for the weekly cadence: the framing is PROGRESS, not deadline. A
// weekly asks "how far through the month are we", so "day 7 of 31" replaces
// "24 days left" — and on the first Friday of a month that distinction is what
// stops a structurally small total reading as a bad month.
test('weekly email: day-X-of-Y subject and headline; target columns appear only when a target is set', () => {
  const noTargets = renderReportEmail({
    reportType: 'reminder', periodLabel: 'August 2026',
    data: data(), delayed: false, dueDate: '2026-08-07',
    daysElapsed: 7, daysLeftInMonth: 24,
  });
  assert.equal(noTargets.subject, '2S Weekly Training Progress — August 2026 (day 7 of 31)');
  assert.match(noTargets.html, /August 2026 month-to-date/);
  assert.match(noTargets.html, /day 7 of 31/);
  assert.doesNotMatch(noTargets.html, /days left/);
  assert.doesNotMatch(noTargets.html, /Target/);

  const withTargets = renderReportEmail({
    reportType: 'reminder', periodLabel: 'August 2026',
    data: data({ anyTargetSet: true, rows: [row({ target: 40, pctOfTarget: 50 })] }),
    delayed: false, dueDate: '2026-08-07', daysElapsed: 7, daysLeftInMonth: 24,
  });
  assert.match(withTargets.html, /Target/);
  assert.match(withTargets.html, /50%/);
});

// RULING: a first Friday covering only a few days sends anyway, and must state
// the period and days elapsed plainly so a small number reads as EARLY rather
// than alarming. The subject carries "day 7 of 31"; this is the in-body line.
test('weekly email: the first Friday says the figures are partial; later Fridays do not', () => {
  const first = renderReportEmail({
    reportType: 'reminder', periodLabel: 'August 2026',
    data: data(), delayed: false, dueDate: '2026-08-07',
    daysElapsed: 7, daysLeftInMonth: 24,
  });
  assert.match(first.html, /Covers 1&ndash;7 August 2026/);
  assert.match(first.html, /7 days elapsed, 24 remaining/);
  assert.match(first.html, /first Friday of the month/);
  assert.match(first.html, /cover 7 days, so low totals are expected/);

  const later = renderReportEmail({
    reportType: 'reminder', periodLabel: 'August 2026',
    data: data(), delayed: false, dueDate: '2026-08-21',
    daysElapsed: 21, daysLeftInMonth: 10,
  });
  assert.match(later.html, /Covers 1&ndash;21 August 2026/);
  assert.match(later.html, /21 days elapsed, 10 remaining/);
  assert.doesNotMatch(later.html, /first Friday of the month/);

  // Day 7 exactly is the boundary; day 8 is not "early".
  const boundary = renderReportEmail({
    reportType: 'reminder', periodLabel: 'August 2026',
    data: data(), delayed: false, dueDate: '2026-08-07', daysElapsed: 8, daysLeftInMonth: 23,
  });
  assert.doesNotMatch(boundary.html, /first Friday of the month/);
});

// The month length is recovered as daysElapsed + daysLeftInMonth rather than by
// calendar arithmetic, because this module is deliberately calendar-free. That
// makes it an implicit cross-file contract; report-schedule.test.ts pins the
// producing side, and this pins that a 30-day month reads as 30.
test('weekly email: month length comes from the two day counts, so a 30-day month says 30', () => {
  const sept = renderReportEmail({
    reportType: 'reminder', periodLabel: 'September 2026',
    data: data(), delayed: false, dueDate: '2026-09-25', daysElapsed: 25, daysLeftInMonth: 5,
  });
  assert.equal(sept.subject, '2S Weekly Training Progress — September 2026 (day 25 of 30)');
});

// The monthly summary is unchanged by all of this — same subject, and no weekly
// progress line. Asserted so a future edit to the shared renderer cannot quietly
// give the summary a "day X of Y" it should not have.
test('summary email is untouched by the weekly framing', () => {
  const { subject, html } = renderReportEmail({
    reportType: 'monthly_summary', periodLabel: 'August 2026',
    data: data(), delayed: false, dueDate: '2026-09-01',
  });
  assert.equal(subject, '2S Monthly Training Summary — August 2026');
  assert.match(html, /August 2026 training summary/);
  assert.doesNotMatch(html, /month-to-date/);
  assert.doesNotMatch(html, /days elapsed/);
});

test('pct pill tiers: green >=100%, amber 50-99%, red <50%, gray no-target — each with its tier hex', () => {
  const { html } = renderReportEmail({
    reportType: 'reminder', periodLabel: 'July 2026',
    data: data({
      anyTargetSet: true,
      rows: [
        row({ department: 'On Target', target: 40, pctOfTarget: 100 }),   // green
        row({ department: 'Amber Zone', target: 40, pctOfTarget: 50 }),   // amber
        row({ department: 'Behind', target: 40, pctOfTarget: 20 }),       // red
        row({ department: 'No Target Dept', target: null, pctOfTarget: null }), // gray
      ],
    }),
    delayed: false, dueDate: '2026-07-24', daysLeftInMonth: 7,
  });
  // green >= 100%
  assert.match(html, /background:#08251f;border:1px solid #245747;color:#bbf7d0;">100%/);
  // amber 50-99%
  assert.match(html, /background:#251f0e;border:1px solid #5c4920;color:#fde68a;">50%/);
  // red < 50%
  assert.match(html, /background:#2b151d;border:1px solid #5f2934;color:#fecdd3;">20%/);
  // gray: no target set for this row
  assert.match(html, /background:#16243a;color:#7f93ad;">—/);
});

test('delayed banner and data-quality footnote render when present, absent otherwise', () => {
  const late = renderReportEmail({
    reportType: 'monthly_summary', periodLabel: 'July 2026',
    data: data({ dataQualityNote: '1 session(s) have incomplete mirror data — x' }),
    delayed: true, dueDate: '2026-08-01',
  });
  assert.match(late.html, /Delayed — originally due 2026-08-01/);
  assert.match(late.html, /incomplete mirror data/);
  const onTime = renderReportEmail({
    reportType: 'monthly_summary', periodLabel: 'July 2026',
    data: data(), delayed: false, dueDate: '2026-08-01',
  });
  assert.doesNotMatch(onTime.html, /Delayed/);
});

test('test mode prefixes subject', () => {
  const r = renderReportEmail({
    reportType: 'monthly_summary', periodLabel: 'July 2026',
    data: data(), delayed: false, dueDate: '2026-08-01', testMode: true,
  });
  assert.match(r.subject, /^\[TEST\] /);
});

test('HTML-escapes department names', () => {
  const r = renderReportEmail({
    reportType: 'monthly_summary', periodLabel: 'July 2026',
    data: data({ rows: [row({ department: 'F&B <script>' })] }),
    delayed: false, dueDate: '2026-08-01',
  });
  assert.match(r.html, /F&amp;B &lt;script&gt;/);
  assert.doesNotMatch(r.html, /<script>/);
});

test('outstanding-failures banner absent when the array is empty or omitted', () => {
  const omitted = renderReportEmail({
    reportType: 'monthly_summary', periodLabel: 'July 2026',
    data: data(), delayed: false, dueDate: '2026-08-01',
  });
  assert.doesNotMatch(omitted.html, /Unsent reports need attention/);

  const empty = renderReportEmail({
    reportType: 'monthly_summary', periodLabel: 'July 2026',
    data: data(), delayed: false, dueDate: '2026-08-01', outstandingFailures: [],
  });
  assert.doesNotMatch(empty.html, /Unsent reports need attention/);
});

test('outstanding-failures banner present with report/period/attempts when populated', () => {
  const { html } = renderReportEmail({
    reportType: 'monthly_summary', periodLabel: 'August 2026',
    data: data(), delayed: false, dueDate: '2026-09-01',
    outstandingFailures: [
      { reportType: 'reminder', period: '2026-07', occurrence: '2026-07-24', attempts: 42, lastError: 'Graph 403 ErrorAccessDenied' },
    ],
  });
  assert.match(html, /Unsent reports need attention/);
  assert.match(html, /Reminder/);
  // Names the OCCURRENCE, not just the period: four weekly rows can share
  // period 2026-07, so "the reminder for 2026-07 failed" identifies nothing —
  // a reader could not tell which Friday, or whether two of them failed.
  assert.match(html, /due <strong>2026-07-24<\/strong>/);
  assert.match(html, /2026-07/);
  assert.match(html, /42 failed attempt\(s\)/);
  assert.match(html, /Graph 403 ErrorAccessDenied/);
  // Renders above the delayed banner slot, i.e. near the top of the card.
  assert.ok(html.indexOf('Unsent reports need attention') < html.indexOf('Department'));
});

test('outstanding-failures banner truncates a long last_error and HTML-escapes it', () => {
  const longError = `<script>alert(1)</script> ${'x'.repeat(300)}`;
  const { html } = renderReportEmail({
    reportType: 'monthly_summary', periodLabel: 'August 2026',
    data: data(), delayed: false, dueDate: '2026-09-01',
    outstandingFailures: [
      { reportType: 'monthly_summary', period: '2026-06', occurrence: '2026-07-01', attempts: 3, lastError: longError },
    ],
  });
  assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  // Truncated to ~160 chars: the tail of the 300-char run of x's must be gone.
  assert.ok(!html.includes('x'.repeat(300)));
  assert.match(html, /…/);
});

test('outstanding-failures banner handles a null last_error', () => {
  const { html } = renderReportEmail({
    reportType: 'monthly_summary', periodLabel: 'August 2026',
    data: data(), delayed: false, dueDate: '2026-09-01',
    outstandingFailures: [
      { reportType: 'reminder', period: '2026-07', occurrence: '2026-07-31', attempts: 1, lastError: null },
    ],
  });
  assert.match(html, /no error recorded/);
});
