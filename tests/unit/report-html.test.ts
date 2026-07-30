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

test('reminder email: days-left headline; target columns appear only when a target is set', () => {
  const noTargets = renderReportEmail({
    reportType: 'reminder', periodLabel: 'July 2026',
    data: data(), delayed: false, dueDate: '2026-07-24', daysLeftInMonth: 7,
  });
  assert.match(noTargets.subject, /7 days left in July 2026/);
  assert.doesNotMatch(noTargets.html, /Target/);

  const withTargets = renderReportEmail({
    reportType: 'reminder', periodLabel: 'July 2026',
    data: data({ anyTargetSet: true, rows: [row({ target: 40, pctOfTarget: 50 })] }),
    delayed: false, dueDate: '2026-07-24', daysLeftInMonth: 7,
  });
  assert.match(withTargets.html, /Target/);
  assert.match(withTargets.html, /50%/);
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
