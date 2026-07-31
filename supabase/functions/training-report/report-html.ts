// Pure HTML/subject rendering for training report emails. ZERO runtime
// imports (type-only imports from siblings are erased at compile time): runs
// under Deno (edge deploy) and Node type-stripping (unit tests) alike.
//
// Visual family matches the daily "Render Review Email" n8n node: dark
// hotel-console card on a near-black page background, cyan eyebrow, KPI
// tiles, and a muted-but-visible zero-row department table.

import type { ReportData, DeptReportRow } from './report-aggregator.ts';

export interface OutstandingFailure {
  reportType: string;
  period: string;
  attempts: number;
  lastError: string | null;
}

export interface RenderReportEmailOptions {
  reportType: 'monthly_summary' | 'reminder';
  periodLabel: string;        // e.g. "July 2026"
  data: ReportData;
  delayed: boolean;
  dueDate: string;            // YYYY-MM-DD
  daysLeftInMonth?: number;
  testMode?: boolean;
  // Other (report_type, period) rows currently sitting 'failed' in
  // report_runs, excluding the one this email itself covers. Rendered as a
  // prominent warning block near the top of the email when non-empty — see
  // index.ts's fetchOutstandingFailures for how this is populated.
  outstandingFailures?: OutstandingFailure[];
}

export interface RenderedReportEmail {
  subject: string;
  html: string;
}

function esc(value: string | number): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmtHours(n: number): string {
  return n.toFixed(1);
}

function fmtTarget(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function pctTone(pct: number | null): string {
  if (pct === null) return 'background:#16243a;color:#7f93ad;';
  if (pct >= 100) return 'background:#08251f;border:1px solid #245747;color:#bbf7d0;';
  if (pct >= 50) return 'background:#251f0e;border:1px solid #5c4920;color:#fde68a;';
  return 'background:#2b151d;border:1px solid #5f2934;color:#fecdd3;';
}

function pctPill(pct: number | null): string {
  const label = pct === null ? '—' : `${esc(pct)}%`;
  return `<span style="border-radius:16px;padding:3px 10px;font-size:11px;font-weight:700;${pctTone(pct)}">${label}</span>`;
}

function kpiTile(label: string, value: string): string {
  return `
        <td width="33%" valign="top">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;">
            <tr>
              <td style="background:#10243c;border:1px solid #315b7f;border-radius:22px;padding:14px 18px;">
                <div style="font-size:11px;color:#7f93ad;text-transform:uppercase;letter-spacing:0.5px;">${esc(label)}</div>
                <div style="font-size:20px;color:#ffffff;font-weight:700;margin-top:4px;">${esc(value)}</div>
              </td>
            </tr>
          </table>
        </td>`;
}

function headerRow(anyTargetSet: boolean): string {
  const th = 'color:#7f93ad;font-size:11px;text-transform:uppercase;border-bottom:1px solid #22334a;padding:9px 10px;';
  const thNum = `${th}text-align:right;`;
  let cells = `
        <th align="left" style="${th}">Department</th>
        <th align="right" style="${thNum}">Trainers</th>
        <th align="right" style="${thNum}">Colleagues</th>
        <th align="right" style="${thNum}">Man-hours</th>`;
  if (anyTargetSet) {
    cells += `
        <th align="right" style="${thNum}">Target</th>
        <th align="right" style="${thNum}">% of target</th>`;
  }
  return `<tr>${cells}\n      </tr>`;
}

function dataRow(row: DeptReportRow, anyTargetSet: boolean): string {
  const isZero = row.trainers === 0 && row.colleagues === 0 && row.manHours === 0;
  const color = isZero ? '#7f93ad' : '#e5eefb';
  const td = `padding:9px 10px;font-size:13px;color:${color};border-bottom:1px solid #16243a;`;
  const tdNum = `${td}text-align:right;`;
  let cells = `
        <td style="${td}">${esc(row.department)}</td>
        <td style="${tdNum}">${esc(row.trainers)}</td>
        <td style="${tdNum}">${esc(row.colleagues)}</td>
        <td style="${tdNum}">${esc(fmtHours(row.manHours))}</td>`;
  if (anyTargetSet) {
    const targetText = row.target === null ? '—' : esc(fmtTarget(row.target));
    cells += `
        <td style="${tdNum}">${targetText}</td>
        <td style="${tdNum}">${pctPill(row.pctOfTarget)}</td>`;
  }
  return `<tr>${cells}\n      </tr>`;
}

const REPORT_TYPE_LABEL: Record<string, string> = {
  monthly_summary: 'Monthly summary',
  reminder: 'Reminder',
};

const LAST_ERROR_MAX_CHARS = 160;

function truncateError(err: string | null): string {
  if (!err) return '(no error recorded)';
  return err.length > LAST_ERROR_MAX_CHARS ? `${err.slice(0, LAST_ERROR_MAX_CHARS)}…` : err;
}

// "Unsent reports need attention" — the remedy for the residual silent-failure
// gap: a report whose entire due window fails leaves a permanent 'failed' row
// in report_runs that nothing alerts on. The next email that DOES go out
// mentions it, using the same red/amber alert palette already established by
// pctTone's red tier and the delayed banner below (#2b151d / #5f2934 /
// #fecdd3). Renders nothing when the array is empty or omitted.
function outstandingFailuresBanner(failures?: OutstandingFailure[]): string {
  if (!failures || failures.length === 0) return '';
  const items = failures.map((f) => {
    const label = REPORT_TYPE_LABEL[f.reportType] ?? f.reportType;
    return `
              <li style="margin:0 0 6px 0;">
                <strong>${esc(label)}</strong> for <strong>${esc(f.period)}</strong> — ${esc(f.attempts)} failed attempt(s). Last error: ${esc(truncateError(f.lastError))}
              </li>`;
  }).join('');
  return `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px 0;">
        <tr>
          <td style="background:#2b151d;border:1px solid #5f2934;color:#fecdd3;border-radius:16px;padding:12px 16px;font-size:13px;">
            <div style="font-weight:700;margin-bottom:6px;">Unsent reports need attention</div>
            <ul style="margin:0;padding-left:18px;">${items}
            </ul>
          </td>
        </tr>
      </table>`;
}

function subjectFor(opts: RenderReportEmailOptions): string {
  const base = opts.reportType === 'monthly_summary'
    ? `2S Monthly Training Summary — ${opts.periodLabel}`
    : `2S Training Reminder — ${opts.daysLeftInMonth ?? 0} days left in ${opts.periodLabel}`;
  return opts.testMode ? `[TEST] ${base}` : base;
}

export function renderReportEmail(opts: RenderReportEmailOptions): RenderedReportEmail {
  const { data } = opts;
  const subject = subjectFor(opts);

  const headline = opts.reportType === 'monthly_summary'
    ? `${esc(opts.periodLabel)} training summary`
    : `${esc(opts.daysLeftInMonth ?? 0)} days left in ${esc(opts.periodLabel)}`;

  const outstandingBanner = outstandingFailuresBanner(opts.outstandingFailures);

  const delayedBanner = opts.delayed
    ? `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px 0;">
        <tr>
          <td style="background:#2b151d;border:1px solid #5f2934;color:#fecdd3;border-radius:16px;padding:10px 14px;font-size:13px;">
            Delayed — originally due ${esc(opts.dueDate)}
          </td>
        </tr>
      </table>`
    : '';

  const kpiRow = `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="6" style="margin:0 0 20px 0;">
        <tr>${kpiTile('Man-hours', fmtHours(data.totals.manHours))}${kpiTile('Colleagues', String(data.totals.colleagues))}${kpiTile('Trainers', String(data.totals.trainers))}
        </tr>
      </table>`;

  const rows = data.rows.map((row) => dataRow(row, data.anyTargetSet)).join('\n      ');

  const footnote = data.dataQualityNote
    ? `<p style="color:#7f93ad;font-size:11px;margin:16px 0 0 0;">${esc(data.dataQualityNote)}</p>`
    : '';

  const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#07111f;font-family:Arial,Helvetica,sans-serif;color:#e5eefb;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#07111f;">
    <tr>
      <td align="center" style="padding:24px 12px;">
        <table role="presentation" width="680" cellpadding="0" cellspacing="0" align="center" style="width:680px;max-width:680px;">
          <tr>
            <td style="background:#0b1628;border:1px solid #22334a;border-radius:24px;padding:28px;font-family:Arial,Helvetica,sans-serif;">
              <p style="margin:0 0 8px 0;font-size:11px;color:#7dd3fc;font-weight:700;text-transform:uppercase;letter-spacing:1px;">Hotel Training Console</p>
              <p style="margin:0 0 20px 0;font-size:24px;color:#ffffff;font-weight:700;">${headline}</p>
              ${outstandingBanner}
              ${delayedBanner}
              ${kpiRow}
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <thead>
                  ${headerRow(data.anyTargetSet)}
                </thead>
                <tbody>
                  ${rows}
                </tbody>
              </table>
              ${footnote}
              <p style="color:#7f93ad;font-size:11px;margin:20px 0 0 0;">Two Seasons Hotel &amp; Apartments | Sheikh Zayed Road | Dubai Internet City</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject, html };
}
