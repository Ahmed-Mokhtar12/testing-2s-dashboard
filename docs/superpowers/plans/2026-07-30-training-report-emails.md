# Training Report Emails Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Monthly training summary (1st of month, previous month) and pre-deadline reminder (last day − 7, month-to-date) emails, per-department, sent via Graph from `sera@2seasonshotels.com` to the three managers, scheduled by an hourly pg_cron heartbeat that retries until sent and logs every attempt.

**Architecture:** New edge function `training-report` with three pure, Node-unit-testable modules (`report-schedule.ts` date logic, `report-aggregator.ts` metrics, `report-html.ts` rendering) plus an `index.ts` that wires auth modes (`test` = admin caller, `cron` = anon-bearer idempotent heartbeat, `diag` = temporary Azure-permission probe), Graph sendMail, and `report_runs` bookkeeping via the injected service-role client. Two tables: `training_targets` (seeded, all-NULL targets) and `report_runs` (the fail-loudly ledger).

**Tech Stack:** Supabase edge functions (Deno), pg_cron + pg_net, Microsoft Graph app-only (`_shared/graph.ts`), `fetchAllWithCap` paging, `node:test` via `npx tsx --test`.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-30-training-report-emails-design.md` (as amended: no target values — reminder omits Target/Gap/Status columns while all targets are NULL).
- Recipients: `amir.monir@2seasonshotels.com`, `xarmaigne.narciso@2seasonshotels.com`, `ahmed.mokhtar@2seasonshotels.com`. Sender: `sera@2seasonshotels.com`.
- All month boundaries in Asia/Dubai (+04:00 fixed, no DST) — same convention as `training-aggregator.ts` `buildDateRange`.
- Man-hours = Σ(`duration_minutes`/60 × participant-row count of the session), 1 decimal. Attribution: `training_sessions.department`. Distinct trainers from `trainer_names` (trim, case-insensitive). Distinct colleagues by `employee_id` (lowercased).
- Reminder day = `lastDay(month) − 7`. Monthly summary due day 1. Earliest send 08:00 Dubai; grace windows: summary 7 days, reminder 3 days.
- No `.limit(N)` literals over 1000 (source-lint guard); bulk reads via `fetchAllWithCap`.
- One task per commit on `main`; footer `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- Migrations get verbatim rollback files in `supabase/rollbacks/`.
- **Cron auth amendment (supersedes spec's Vault paragraph):** `mode:'cron'` requires only a valid JWT at the gateway (`verify_jwt = true`) and is safe under anon-key invocation because it is idempotent (`report_runs` unique key), sends only to the fixed recipients, only within due windows, and returns no data — the exact trust model of the live `whatsapp-auto-release` cron job. This avoids requiring the user to place the service-role key in Vault. Function-internal DB writes use the auto-injected `SUPABASE_SERVICE_ROLE_KEY`.
- The cron migration is applied ONLY after the user approves real-data test-sends.

## File Structure

```
supabase/functions/training-report/
  index.ts              — HTTP entry: CORS, mode routing, auth gates, Graph send, report_runs upsert
  report-schedule.ts    — pure: Dubai clock, due-report computation, windows (zero imports)
  report-aggregator.ts  — pure: DeptRow[] from session/participant rows + targets (zero imports)
  report-html.ts        — pure: HTML for both report types (zero imports)
supabase/migrations/20260730160000_training_report_tables.sql
supabase/rollbacks/20260730160000_training_report_tables.sql
supabase/migrations/20260731090000_schedule_training_report.sql   (applied at go-live only)
supabase/rollbacks/20260731090000_schedule_training_report.sql
tests/unit/report-schedule.test.ts
tests/unit/report-aggregator.test.ts
tests/unit/report-html.test.ts
docs/it-requests/2026-07-30-mail-send-grant.md   (only if the diag probe shows Mail.Send missing)
```

---

### Task 1: Tables migration (`training_targets` + `report_runs`)

**Files:**
- Create: `supabase/migrations/20260730160000_training_report_tables.sql`
- Create: `supabase/rollbacks/20260730160000_training_report_tables.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Training report emails: department targets (empty for now — doubles as the
-- department universe for zero rows) and the send ledger that makes a
-- silently skipped month impossible.

create table public.training_targets (
  department text primary key,
  monthly_target_hours numeric null,
  updated_at timestamptz not null default now(),
  updated_by text null
);

alter table public.training_targets enable row level security;

create policy "staff can read training targets"
  on public.training_targets for select to authenticated
  using (public.is_hotel_staff(auth.uid()));

create policy "admins manage training targets"
  on public.training_targets for all to authenticated
  using (public.has_role(auth.uid(), 'admin'::app_role))
  with check (public.has_role(auth.uid(), 'admin'::app_role));

insert into public.training_targets (department) values
  ('Engineering'), ('Executive Office'), ('Finance'), ('Food & Beverage'),
  ('Front Office'), ('Housekeeping'), ('Human Resources'),
  ('Information Technology'), ('Kitchen'), ('Materials'), ('Recreation'),
  ('Revenue'), ('Sales & Marketing'), ('Security');

create table public.report_runs (
  report_type text not null check (report_type in ('monthly_summary', 'reminder')),
  period text not null check (period ~ '^\d{4}-\d{2}$'),
  status text not null check (status in ('sent', 'failed')),
  attempts integer not null default 0,
  last_error text null,
  sent_at timestamptz null,
  recipients text[] null,
  updated_at timestamptz not null default now(),
  primary key (report_type, period)
);

alter table public.report_runs enable row level security;

create policy "admins can read report runs"
  on public.report_runs for select to authenticated
  using (public.has_role(auth.uid(), 'admin'::app_role));
-- No authenticated write policies: only the service-role client writes.
```

- [ ] **Step 2: Write the rollback**

```sql
-- ROLLBACK for 20260730160000_training_report_tables.sql. Apply via MCP/psql;
-- NOT a migration (this directory is not scanned by the CLI).
drop table if exists public.report_runs;
drop table if exists public.training_targets;
```

- [ ] **Step 3: Apply via MCP `apply_migration`** (project `yczcebfaqerlwfalrbjn`, name `training_report_tables`).

- [ ] **Step 4: Verify live**

```sql
select count(*) from public.training_targets;                     -- 14
select monthly_target_hours from public.training_targets limit 3; -- all null
select * from public.report_runs;                                 -- 0 rows
```
Also confirm RLS: `select relrowsecurity from pg_class where relname in ('training_targets','report_runs');` → both `t`.

- [ ] **Step 5: Commit** — `feat(training): add training_targets and report_runs tables`

---

### Task 2: `report-schedule.ts` (pure date logic) — TDD

**Files:**
- Create: `supabase/functions/training-report/report-schedule.ts`
- Test: `tests/unit/report-schedule.test.ts`

**Interfaces:**
- Produces:

```ts
export interface DueReport {
  reportType: 'monthly_summary' | 'reminder';
  period: string;          // YYYY-MM the report covers
  dueDate: string;         // YYYY-MM-DD (Dubai) nominal due day
  delayed: boolean;        // true when now is past the due day
  rangeFromISO: string;    // inclusive, +04:00
  rangeToExclusiveISO: string;
  daysLeftInMonth?: number; // reminder only: full days remaining after "today"
}
export function dubaiToday(nowUtcMs: number): { ymd: string; hour: number };
export function lastDayOfMonth(year: number, month1: number): number; // month1 = 1..12
export function reminderDay(year: number, month1: number): number;    // lastDay - 7
export function dueReports(nowUtcMs: number): DueReport[];            // 0, 1 or 2 entries
```

- [ ] **Step 1: Write the failing tests** (`tests/unit/report-schedule.test.ts`, `node:test` + `assert`, imports via relative path `../../supabase/functions/training-report/report-schedule.ts`)

```ts
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
  assert.equal(dueReports(utc('2026-07-28T10:00:00Z')).length, 0);
});

test('both can be due at once (Feb 1 = summary day; never overlaps reminder) — and quiet days return []', () => {
  assert.equal(dueReports(utc('2026-07-30T10:00:00Z')).length, 0);
  assert.equal(dueReports(utc('2026-07-15T10:00:00Z')).length, 0);
});
```

- [ ] **Step 2: Run to verify failure** — `npx tsx --test tests/unit/report-schedule.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement** (`report-schedule.ts`, zero imports; all arithmetic on UTC ms shifted by `+4h`, mirroring `buildDateRange`'s fixed-offset convention)

```ts
// Pure scheduling logic for training report emails. ZERO imports: runs under
// Deno (edge deploy) and Node type-stripping (unit tests) alike.
// All calendar math is Asia/Dubai = UTC+4 fixed (no DST).

const HOUR_MS = 3600_000;
const DUBAI_OFFSET_MS = 4 * HOUR_MS;
const SEND_HOUR_DUBAI = 8;
const SUMMARY_GRACE_DAYS = 7;
const REMINDER_GRACE_DAYS = 3;

export interface DueReport { /* as in Interfaces block above */ }

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

// Day-serial difference between two YYYY-MM-DD strings (b - a), UTC-based.
function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / (24 * HOUR_MS));
}

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
```

(`daysBetween` is exported-or-deleted per use; if unused after implementation, delete it — no dead code.)

- [ ] **Step 4: Run tests** — `npx tsx --test tests/unit/report-schedule.test.ts` → ALL PASS. Also run the full unit suite: `npx tsx --test tests/unit/*.test.ts` (source-lint guard included).

- [ ] **Step 5: Commit** — `feat(training): add report schedule logic (Dubai due-day + grace windows)`

---

### Task 3: `report-aggregator.ts` (pure metrics) — TDD

**Files:**
- Create: `supabase/functions/training-report/report-aggregator.ts`
- Test: `tests/unit/report-aggregator.test.ts`

**Interfaces:**
- Consumes: row shapes matching the live tables (superset of `training-aggregator.ts`'s `TrainingSessionRow` — this module declares its own to also carry `sync_status` and `total_participants`).
- Produces:

```ts
export interface ReportSessionRow {
  training_id: string;
  department: string | null;
  duration_minutes: number | null;
  total_participants: number | null;
  sync_status: string | null;
}
export interface ReportParticipantRow {
  training_id: string;
  employee_id: string | null;
}
export interface TargetRow { department: string; monthly_target_hours: number | null; }
export interface DeptReportRow {
  department: string;
  trainers: number;
  colleagues: number;
  manHours: number;              // 1 decimal
  target: number | null;
  pctOfTarget: number | null;    // null when no target
}
export interface ReportData {
  rows: DeptReportRow[];         // manHours desc, then department asc
  totals: { sessions: number; trainers: number; colleagues: number; manHours: number };
  anyTargetSet: boolean;
  dataQualityNote: string | null;
}
export function aggregateReport(
  sessions: (ReportSessionRow & { trainer_names: string[] | null })[],
  participants: ReportParticipantRow[],
  targets: TargetRow[],
): ReportData;
```

- [ ] **Step 1: Write the failing tests**

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aggregateReport } from '../../supabase/functions/training-report/report-aggregator.ts';

const s = (over = {}) => ({
  training_id: 'TRN-1', department: 'Front Office', duration_minutes: 120,
  total_participants: 2, sync_status: 'synced', trainer_names: ['Ahmed M'], ...over,
});
const p = (training_id: string, employee_id: string) => ({ training_id, employee_id });
const t = (department: string, monthly_target_hours: number | null = null) =>
  ({ department, monthly_target_hours });

test('man-hours = duration x participant rows, credited to session department', () => {
  const data = aggregateReport(
    [s()],
    [p('TRN-1', '1001'), p('TRN-1', '1002')],
    [t('Front Office'), t('Kitchen')],
  );
  const fo = data.rows.find(r => r.department === 'Front Office')!;
  assert.equal(fo.manHours, 4);        // 2h x 2 attendees
  assert.equal(fo.colleagues, 2);
  assert.equal(fo.trainers, 1);
  const kitchen = data.rows.find(r => r.department === 'Kitchen')!;
  assert.deepEqual([kitchen.trainers, kitchen.colleagues, kitchen.manHours], [0, 0, 0]);
});

test('distinct counting: same trainer (case/space) and same employee not double-counted', () => {
  const data = aggregateReport(
    [
      s({ training_id: 'TRN-1', trainer_names: ['Ahmed M '] }),
      s({ training_id: 'TRN-2', trainer_names: ['ahmed m', 'Sara K'] }),
    ],
    [p('TRN-1', '1001'), p('TRN-2', '1001'), p('TRN-2', '1002')],
    [t('Front Office')],
  );
  const fo = data.rows.find(r => r.department === 'Front Office')!;
  assert.equal(fo.trainers, 2);     // Ahmed M + Sara K
  assert.equal(fo.colleagues, 2);   // 1001 counted once
});

test('zero-activity target departments appear; unknown active departments appear too; sort manHours desc', () => {
  const data = aggregateReport(
    [s({ department: 'Spa Services' })],   // not in targets list
    [p('TRN-1', '1001')],
    [t('Front Office'), t('Kitchen')],
  );
  assert.deepEqual(data.rows.map(r => r.department), ['Spa Services', 'Front Office', 'Kitchen']);
});

test('anyTargetSet false when all targets null; pct computed when set', () => {
  const none = aggregateReport([], [], [t('Front Office')]);
  assert.equal(none.anyTargetSet, false);
  const some = aggregateReport(
    [s()], [p('TRN-1', '1001'), p('TRN-1', '1002')],
    [t('Front Office', 8)],
  );
  assert.equal(some.anyTargetSet, true);
  assert.equal(some.rows[0].pctOfTarget, 50);   // 4 of 8 hours
});

test('data quality note on partial sync or participant-count mismatch, else null', () => {
  const clean = aggregateReport([s()], [p('TRN-1', '1001'), p('TRN-1', '1002')], []);
  assert.equal(clean.dataQualityNote, null);
  const partial = aggregateReport(
    [s({ sync_status: 'partial' }), s({ training_id: 'TRN-2', total_participants: 5 })],
    [p('TRN-1', '1001'), p('TRN-1', '1002'), p('TRN-2', '1001')],
    [],
  );
  assert.match(partial.dataQualityNote!, /2 session/);
  assert.match(partial.dataQualityNote!, /SharePoint/);
});

test('totals: sessions count, distinct trainers/colleagues across all, manHours 1 decimal', () => {
  const data = aggregateReport(
    [s(), s({ training_id: 'TRN-2', department: 'Kitchen', duration_minutes: 50, trainer_names: ['Ahmed M'] })],
    [p('TRN-1', '1001'), p('TRN-2', '1001')],
    [],
  );
  assert.equal(data.totals.sessions, 2);
  assert.equal(data.totals.trainers, 1);
  assert.equal(data.totals.colleagues, 1);
  assert.equal(data.totals.manHours, 2.8);   // 2.0 + 50/60x1 = 2.83 → per-dept rounding then sum: 2 + 0.8
});
```

- [ ] **Step 2: Run to verify failure** — FAIL (module not found).

- [ ] **Step 3: Implement** — zero-import module. Group sessions by `department ?? 'Unknown'`; per dept accumulate `Set` of trimmed-lowercased trainer names, `Set` of lowercased employee_ids (from participant rows joined by `training_id`), man-minutes = Σ(duration × participant-row count). `manHours = Math.round(minutes/60 * ppl... )` — compute per-dept man-hours as Σ(duration_minutes × rowCount)/60 rounded to 1 decimal via `Math.round(x*10)/10` (same `round1` as training-aggregator). Universe = union(target depts, active depts); rows sorted `manHours` desc then `department` asc. `totals.manHours` = Σ of the per-dept rounded values, re-rounded to 1 decimal (matches the totals test: 2.0 + 0.8 = 2.8). `dataQualityNote`: count sessions with `sync_status !== 'synced'` OR `total_participants != null && total_participants !== rowCount`; if > 0 → `` `${n} session(s) have incomplete mirror data — Postgres mirrors SharePoint (the source of truth); figures may undercount.` `` else null. `pctOfTarget = target ? Math.round((manHours / target) * 100) : null`.

- [ ] **Step 4: Run tests** — ALL PASS; run full unit suite.

- [ ] **Step 5: Commit** — `feat(training): add report aggregator (man-hours, dept attribution, data-quality note)`

---

### Task 4: `report-html.ts` (email rendering) — TDD

**Files:**
- Create: `supabase/functions/training-report/report-html.ts`
- Test: `tests/unit/report-html.test.ts`

**Interfaces:**
- Consumes: `ReportData`, `DueReport` shapes (re-declared locally or imported from sibling modules — import from siblings is fine, both are zero-Deno).
- Produces:

```ts
export function renderReportEmail(opts: {
  reportType: 'monthly_summary' | 'reminder';
  periodLabel: string;        // e.g. "July 2026"
  data: ReportData;
  delayed: boolean;
  dueDate: string;            // YYYY-MM-DD
  daysLeftInMonth?: number;
  testMode?: boolean;
}): { subject: string; html: string };
```

Subjects: summary `2S Monthly Training Summary — July 2026`; reminder `2S Training Reminder — 7 days left in July 2026`; test mode prefixes `[TEST] `.

- [ ] **Step 1: Write the failing tests**

```ts
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
```

- [ ] **Step 2: Run to verify failure** — FAIL.

- [ ] **Step 3: Implement** — table-based inline-CSS HTML in the daily-reviews visual family. Exact palette (from the live "Render Review Email" node): body `margin:0;padding:0;background:#07111f;font-family:Arial,Helvetica,sans-serif;color:#e5eefb;`; centered 680px card `background:#0b1628;border:1px solid #22334a;border-radius:24px;padding:28px;`; eyebrow `font-size:11px;color:#7dd3fc;font-weight:700;text-transform:uppercase;letter-spacing:1px;` text `Hotel Training Console`; H1-equivalent 24px white (`${periodLabel} training summary` / `${daysLeftInMonth} days left in ${periodLabel}`); KPI trio as three tiles `background:#10243c;border:1px solid #315b7f;border-radius:22px;padding:14px 18px;` showing Man-hours / Colleagues / Trainers totals; delayed banner (when `delayed`) `background:#2b151d;border:1px solid #5f2934;color:#fecdd3;border-radius:16px;padding:10px 14px;` text `Delayed — originally due ${dueDate}`; department table `role="presentation"` width 100%, header row `color:#7f93ad;font-size:11px;text-transform:uppercase;border-bottom:1px solid #22334a;`, data cells `padding:9px 10px;font-size:13px;color:#e5eefb;border-bottom:1px solid #16243a;`, numeric cells right-aligned; zero rows styled `color:#7f93ad;` (muted, still visible); target columns (only when `anyTargetSet`): Target (or `—`), `% of target` with pill `border-radius:16px;padding:3px 10px;font-size:11px;font-weight:700;` — green `background:#08251f;border:1px solid #245747;color:#bbf7d0` ≥100, amber `background:#251f0e;border:1px solid #5c4920;color:#fde68a` ≥50, red `background:#2b151d;border:1px solid #5f2934;color:#fecdd3` <50, gray `background:#16243a;color:#7f93ad` no target; footnote paragraph (when `dataQualityNote`) `color:#7f93ad;font-size:11px;`; footer `color:#7f93ad;font-size:11px;` `Two Seasons Hotel & Apartments | Sheikh Zayed Road | Dubai Internet City`. Include an `esc()` HTML-escaper (`&`, `<`, `>`, `"`) applied to every interpolated string.

- [ ] **Step 4: Run tests** — ALL PASS; full unit suite green.

- [ ] **Step 5: Commit** — `feat(training): render report emails in reviews-console visual family`

---

### Task 5: `index.ts` — modes, auth, Graph send, ledger; deploy v1 with diag probe

**Files:**
- Create: `supabase/functions/training-report/index.ts`

**Interfaces:**
- Consumes: `dueReports` (Task 2), `aggregateReport` (Task 3), `renderReportEmail` (Task 4), `_shared/http.ts` `corsHeaders`/`json`, `_shared/auth.ts` `getCallerUser`, `_shared/graph.ts` `haveAzureCreds`/`getAppToken`/`graphFetch`/`GRAPH_BASE`, `chat-with-data/paged-fetch.ts` `fetchAllWithCap` (import via relative path `../chat-with-data/paged-fetch.ts` — same cross-function import style must be checked; if the deploy bundler rejects cross-function imports, copy the file into `training-report/paged-fetch.ts` verbatim instead and note it).
- Produces: HTTP contract —
  - `POST {mode:'test', report:'monthly'|'reminder', period?:'YYYY-MM'}` → admin caller only → sends to caller only, `[TEST]` subject → `{ ok: true, sentTo, subject, period }`.
  - `POST {mode:'cron'}` → any valid JWT → runs due-report loop → `{ ok: true, due: n, sent: n, failed: n }` (counts only — no recipient/content data).
  - `POST {mode:'diag'}` → any valid JWT → **temporary** (removed in Task 7) → `{ roles: string[] }` decoded from the app token, no Graph calls beyond token fetch.

Key implementation blocks:

```ts
import { corsHeaders, json } from '../_shared/http.ts';
import { getCallerUser } from '../_shared/auth.ts';
import { haveAzureCreds, getAppToken, graphFetch, GRAPH_BASE, GraphError } from '../_shared/graph.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { fetchAllWithCap } from '../chat-with-data/paged-fetch.ts';
import { dueReports, dubaiToday, lastDayOfMonth, reminderDay } from './report-schedule.ts';
import { aggregateReport } from './report-aggregator.ts';
import { renderReportEmail } from './report-html.ts';

const SENDER = 'sera@2seasonshotels.com';
const RECIPIENTS = [
  'amir.monir@2seasonshotels.com',
  'xarmaigne.narciso@2seasonshotels.com',
  'ahmed.mokhtar@2seasonshotels.com',
];
const SESSION_CAP = 2000;
const PARTICIPANT_CAP = 10000;

function serviceClient() {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
}

async function sendMail(token: string, to: string[], subject: string, html: string) {
  await graphFetch(token, `${GRAPH_BASE}/users/${SENDER}/sendMail`, {
    method: 'POST',
    body: JSON.stringify({
      message: {
        subject,
        body: { contentType: 'HTML', content: html },
        toRecipients: to.map((address) => ({ emailAddress: { address } })),
      },
      saveToSentItems: true,
    }),
  });
}

async function fetchReportData(db, fromISO: string, toExclusiveISO: string) {
  const sessions = await fetchAllWithCap((from, to, withCount) => {
    let q = db.from('training_sessions')
      .select('training_id, department, duration_minutes, total_participants, sync_status, trainer_names',
        withCount ? { count: 'exact' } : {})
      .gte('training_date', fromISO).lt('training_date', toExclusiveISO)
      .order('training_id', { ascending: true })
      .range(from, to);
    return q;
  }, SESSION_CAP);
  if (sessions.error) throw new Error(`sessions fetch failed: ${JSON.stringify(sessions.error)}`);
  const ids = sessions.rows.map((s) => s.training_id);
  let participants = { rows: [] as { training_id: string; employee_id: string | null }[] };
  if (ids.length > 0) {
    const p = await fetchAllWithCap((from, to, withCount) =>
      db.from('training_participants')
        .select('training_id, employee_id', withCount ? { count: 'exact' } : {})
        .in('training_id', ids)
        .order('id', { ascending: true })
        .range(from, to), PARTICIPANT_CAP);
    if (p.error) throw new Error(`participants fetch failed: ${JSON.stringify(p.error)}`);
    participants = p;
  }
  const t = await db.from('training_targets').select('department, monthly_target_hours');
  if (t.error) throw new Error(`targets fetch failed: ${JSON.stringify(t.error)}`);
  return { sessions: sessions.rows, participants: participants.rows, targets: t.data ?? [] };
}
```

Mode handling in `Deno.serve`:
- OPTIONS → `new Response('ok', { headers: corsHeaders(req) })`.
- `!haveAzureCreds()` → 503 (same message as sp-* functions).
- Parse body; unknown mode → 400.
- **diag**: `const token = await getAppToken(); const claims = JSON.parse(atob(token.split('.')[1])); return json(req, { roles: claims.roles ?? [] });`
- **test**: `const caller = await getCallerUser(req);` → 401 if null; admin check via the caller-JWT client (`createClient` with forwarded Authorization header, as in `_shared/auth.ts`): `const { data: isAdmin } = await callerClient.rpc('has_role', { _user_id: caller.id, _role: 'admin' }); if (!isAdmin) return json(req, { error: 'Unauthorised: admin access required.' }, 403);` Then resolve the report: `report:'monthly'` → period = given `period` or previous Dubai month, range = that whole month; `report:'reminder'` → period = given or current Dubai month, range = month start → start of tomorrow (Dubai), `daysLeftInMonth = lastDayOfMonth(...) - todayDay` (reuse schedule helpers; compute directly rather than requiring today to be a due day). Fetch (service client), aggregate, render with `testMode: true`, send to `[caller.email]` only. Return `{ ok: true, sentTo: caller.email, subject, period }`.
- **cron**: for each `dueReports(Date.now())` entry: skip if `report_runs` has `status='sent'` for (type, period); otherwise attempt: fetch → aggregate → render (`delayed`, `daysLeftInMonth` from the DueReport) → `sendMail(token, RECIPIENTS, …)` → upsert `{ report_type, period, status: 'sent', attempts: prev+1, sent_at: new Date().toISOString(), recipients: RECIPIENTS, last_error: null, updated_at: … }`; on error upsert `{ status: 'failed', attempts: prev+1, last_error: String(err).slice(0, 2000), updated_at: … }` and continue to the next due report. Return counts only.

- [ ] **Step 1: Write `index.ts`** per above. Run `npm run lint` (eslint ignores supabase/? check — if not linted, skip) and the unit suite (`npx tsx --test tests/unit/*.test.ts`) — the source-lint guard scans this file; ensure no `.limit(` literals.

- [ ] **Step 2: Deploy v1 via MCP `deploy_edge_function`** (project `yczcebfaqerlwfalrbjn`, name `training-report`, `verify_jwt: true`), including files: `index.ts`, `report-schedule.ts`, `report-aggregator.ts`, `report-html.ts`, plus `../_shared/http.ts`, `../_shared/auth.ts`, `../_shared/graph.ts`, `../chat-with-data/paged-fetch.ts` with their repo-relative paths preserved. If MCP deploy rejects the cross-directory layout, fall back to copying the four dependencies into the function directory with adjusted imports (record the deviation).

- [ ] **Step 3: Verify the deploy gate** — two curls, both must return 401/`Not authenticated`-class errors:

```bash
curl -s -o /dev/null -w '%{http_code}\n' -X POST https://yczcebfaqerlwfalrbjn.supabase.co/functions/v1/training-report -d '{"mode":"cron"}'          # expect 401 (no JWT)
```

Then with the anon key (public, from `src/integrations/supabase/client.ts` or MCP `get_publishable_keys`):

```bash
curl -s -X POST https://yczcebfaqerlwfalrbjn.supabase.co/functions/v1/training-report \
  -H "Authorization: Bearer $ANON_KEY" -H "apikey: $ANON_KEY" -H "Content-Type: application/json" \
  -d '{"mode":"cron"}'
# expect {"ok":true,"due":0,...} — July 30 is outside both windows, so a no-op; proves gateway + code path
```

- [ ] **Step 4: Run the diag probe**

```bash
curl -s -X POST https://yczcebfaqerlwfalrbjn.supabase.co/functions/v1/training-report \
  -H "Authorization: Bearer $ANON_KEY" -H "apikey: $ANON_KEY" -H "Content-Type: application/json" \
  -d '{"mode":"diag"}'
```
Record the `roles` array. **If it contains `Mail.Send`** → Azure is ready; skip Task 6's doc-only path note in the final report. **If not** → Task 6 writes the IT request; sending will 403 until granted.

- [ ] **Step 5: Commit** — `feat(training): add training-report edge function (test/cron modes, Graph send, run ledger)`

---

### Task 6: Azure outcome handling

**Files:**
- Create (only if Mail.Send missing): `docs/it-requests/2026-07-30-mail-send-grant.md`

- [ ] **Step 1:** If the Task 5 diag probe showed `Mail.Send` present: record that in the final report; done. Otherwise write the IT request modeled on `docs/it-requests/2026-07-27-sites-selected-site-grant.md`: tenant `2e9f09ed-8e4e-48d6-b37e-77b4bd4941a4`, the app behind `AZURE_CLIENT_ID`, Graph **application** permission `Mail.Send` + admin consent, then Exchange Online PowerShell:

```powershell
New-ApplicationAccessPolicy -AppId <AZURE_CLIENT_ID> -PolicyScopeGroupId sera@2seasonshotels.com \
  -AccessRight RestrictAccess -Description "training-report: send as sera only"
```

- [ ] **Step 2:** Commit if the doc was written — `docs(training): add Mail.Send grant IT request`

---

### Task 7: Remove diag mode + final deploy

**Files:**
- Modify: `supabase/functions/training-report/index.ts` (delete the diag branch)

- [ ] **Step 1:** Delete the `diag` mode branch. Redeploy via MCP `deploy_edge_function`. Verify `{"mode":"diag"}` now returns 400 and `{"mode":"cron"}` still returns `{ ok: true, due: 0 … }`.
- [ ] **Step 2:** Commit — `chore(training): remove temporary Azure diag probe from training-report`

---

### Task 8: Cron migration (WRITTEN now, APPLIED only after user approves test-sends)

**Files:**
- Create: `supabase/migrations/20260731090000_schedule_training_report.sql`
- Create: `supabase/rollbacks/20260731090000_schedule_training_report.sql`

- [ ] **Step 1: Write migration**

```sql
-- Hourly heartbeat for training report emails. The function itself decides
-- what (if anything) is due — Dubai date logic, idempotent via report_runs,
-- retries across the grace window. Anon bearer is sufficient by design: the
-- endpoint is idempotent, fixed-recipient, and returns no data (same trust
-- model as whatsapp-auto-release).
select cron.schedule(
  'training-report-hourly',
  '0 * * * *',
  $$
  select net.http_post(
    url := 'https://yczcebfaqerlwfalrbjn.supabase.co/functions/v1/training-report',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer <ANON_KEY>'
    ),
    body := '{"mode":"cron"}'::jsonb
  ) as request_id;
  $$
);
```

(`<ANON_KEY>` = the project's public anon key — same literal-key pattern as the live `whatsapp-auto-release-every-minute` job; it is a public value shipped in the frontend bundle.)

- [ ] **Step 2: Write rollback**

```sql
-- ROLLBACK for 20260731090000_schedule_training_report.sql.
select cron.unschedule('training-report-hourly');
```

- [ ] **Step 3: Commit** (file only, NOT applied) — `feat(training): add training-report hourly cron migration (apply at go-live)`

- [ ] **Step 4 (GO-LIVE, blocked on user):** After the user confirms both test emails look right: apply via MCP `apply_migration`, then verify `select jobname, schedule from cron.job;` shows `training-report-hourly`, and after the next top of hour `select * from cron.job_run_details order by start_time desc limit 3;` shows a succeeded run.

---

## Test-send instructions (for the user — include in final report)

In the dashboard (logged in as admin), browser devtools console:

```js
const s = JSON.parse(localStorage.getItem('sb-yczcebfaqerlwfalrbjn-auth-token'));
copy(s.access_token)   // JWT now in clipboard
```

Then (replace `$JWT`; anon key is the public one from the site):

```bash
curl -s -X POST https://yczcebfaqerlwfalrbjn.supabase.co/functions/v1/training-report \
  -H "Authorization: Bearer $JWT" -H "apikey: $ANON_KEY" -H "Content-Type: application/json" \
  -d '{"mode":"test","report":"monthly","period":"2026-07"}'

curl -s -X POST https://yczcebfaqerlwfalrbjn.supabase.co/functions/v1/training-report \
  -H "Authorization: Bearer $JWT" -H "apikey: $ANON_KEY" -H "Content-Type: application/json" \
  -d '{"mode":"test","report":"reminder"}'
```

Both arrive at the caller's mailbox only, `[TEST]`-prefixed.
