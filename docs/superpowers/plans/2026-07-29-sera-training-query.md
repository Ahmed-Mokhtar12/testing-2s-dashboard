# Sera Training Query Tool Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `query_training_records` function-calling tool to the `chat-with-data` edge function so Sera answers training questions (hours, participants, trainers, per department/period) with code-computed exact numbers from the Supabase mirror tables.

**Architecture:** A pure, dependency-free aggregation module (`training-aggregator.ts`, unit-tested with Node 24's built-in test runner) is wrapped by a thin Deno service (`training-query-service.ts`) that queries `training_sessions` / `training_participants` with the service-role client. The tool plugs into the existing `FunctionCallHandler` → `callOpenAI` two-pass loop that `search_web` already uses. Dead `Conducted Training` fetches are removed and the hard-coded "January 2, 2025" reference date is fixed.

**Tech Stack:** Deno edge function (Supabase), supabase-js v2, OpenAI function calling, Node 24 `node --test` for unit tests.

**Spec:** `docs/superpowers/specs/2026-07-29-sera-training-query-design.md`

## Global Constraints

- `training-aggregator.ts` must have **zero imports** (no Deno/URL imports) so it runs under both Deno (deploy) and Node 24 type-stripping (`node --test`).
- Unit tests live next to the module (`supabase/functions/chat-with-data/*.test.ts`) — NOT under `tests/` (Playwright's testDir would pick them up).
- Dates are interpreted in Asia/Dubai (+04:00, no DST). Inclusive `date_from`/`date_to` in `YYYY-MM-DD`.
- Hours = sum of `duration_minutes` / 60, rounded to 1 decimal. Distinct participants by `employee_id`; distinct trainers by name string.
- Caps: 500 sessions / 2000 participant rows per query; set `truncated: true` when hit.
- Tool error messages are English plain text (e.g. "Training data is temporarily unavailable...").
- No new npm/deno dependencies. Follow the existing emoji console-log style of the function.
- Every task's commit message ends with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

---

### Task 1: Pure date-range helper (`buildDateRange`)

**Files:**
- Create: `supabase/functions/chat-with-data/training-aggregator.ts`
- Test: `supabase/functions/chat-with-data/training-aggregator.test.ts`

**Interfaces:**
- Produces: `buildDateRange(date_from?: string, date_to?: string): DateRangeResult` where
  `type DateRangeResult = { fromISO: string | null; toExclusiveISO: string | null; swapped: boolean; error: string | null }`.
  `fromISO` example: `2026-07-22T00:00:00+04:00`. `toExclusiveISO` is date_to **+ 1 day** at Dubai midnight (exclusive upper bound). Task 3 uses these directly in `.gte()` / `.lt()` on `training_date`.

- [ ] **Step 1: Write the failing tests**

Create `supabase/functions/chat-with-data/training-aggregator.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert';
import { buildDateRange } from './training-aggregator.ts';

test('buildDateRange: both dates → Dubai midnight bounds, exclusive end is +1 day', () => {
  const r = buildDateRange('2026-07-22', '2026-07-28');
  assert.equal(r.error, null);
  assert.equal(r.fromISO, '2026-07-22T00:00:00+04:00');
  assert.equal(r.toExclusiveISO, '2026-07-29T00:00:00+04:00');
  assert.equal(r.swapped, false);
});

test('buildDateRange: month/year rollover on exclusive end', () => {
  const r = buildDateRange(undefined, '2026-12-31');
  assert.equal(r.toExclusiveISO, '2027-01-01T00:00:00+04:00');
  assert.equal(r.fromISO, null);
});

test('buildDateRange: open-ended when both omitted', () => {
  const r = buildDateRange(undefined, undefined);
  assert.deepEqual(r, { fromISO: null, toExclusiveISO: null, swapped: false, error: null });
});

test('buildDateRange: reversed range is silently swapped', () => {
  const r = buildDateRange('2026-07-28', '2026-07-22');
  assert.equal(r.fromISO, '2026-07-22T00:00:00+04:00');
  assert.equal(r.toExclusiveISO, '2026-07-29T00:00:00+04:00');
  assert.equal(r.swapped, true);
});

test('buildDateRange: invalid format returns error', () => {
  const r = buildDateRange('22/07/2026', undefined);
  assert.match(r.error ?? '', /YYYY-MM-DD/);
});

test('buildDateRange: impossible date returns error', () => {
  const r = buildDateRange('2026-02-30', undefined);
  assert.notEqual(r.error, null);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test supabase/functions/chat-with-data/training-aggregator.test.ts`
Expected: FAIL (module `./training-aggregator.ts` not found).

- [ ] **Step 3: Write the implementation**

Create `supabase/functions/chat-with-data/training-aggregator.ts`:

```ts
// Pure aggregation logic for the query_training_records tool.
// ZERO imports on purpose: this module runs under Deno (edge deploy)
// and under Node 24 type-stripping (unit tests via `node --test`).

export interface DateRangeResult {
  fromISO: string | null;
  toExclusiveISO: string | null;
  swapped: boolean;
  error: string | null;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isRealDate(ymd: string): boolean {
  const d = new Date(`${ymd}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === ymd;
}

function addOneDay(ymd: string): string {
  const d = new Date(Date.parse(`${ymd}T00:00:00Z`) + 24 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

export function buildDateRange(date_from?: string, date_to?: string): DateRangeResult {
  const bad = (which: string, value: string): DateRangeResult => ({
    fromISO: null,
    toExclusiveISO: null,
    swapped: false,
    error: `Invalid ${which} "${value}": must be a real date in YYYY-MM-DD format.`,
  });

  if (date_from !== undefined && (!DATE_RE.test(date_from) || !isRealDate(date_from))) {
    return bad('date_from', date_from);
  }
  if (date_to !== undefined && (!DATE_RE.test(date_to) || !isRealDate(date_to))) {
    return bad('date_to', date_to);
  }

  let from = date_from ?? null;
  let to = date_to ?? null;
  let swapped = false;
  if (from && to && from > to) {
    [from, to] = [to, from];
    swapped = true;
  }

  return {
    fromISO: from ? `${from}T00:00:00+04:00` : null,
    toExclusiveISO: to ? `${addOneDay(to)}T00:00:00+04:00` : null,
    swapped,
    error: null,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test supabase/functions/chat-with-data/training-aggregator.test.ts`
Expected: all 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/chat-with-data/training-aggregator.ts supabase/functions/chat-with-data/training-aggregator.test.ts
git commit -m "feat(sera): pure Dubai date-range helper for training queries"
```

---

### Task 2: Pure aggregation (`aggregateTrainingData`)

**Files:**
- Modify: `supabase/functions/chat-with-data/training-aggregator.ts` (append)
- Test: `supabase/functions/chat-with-data/training-aggregator.test.ts` (append)

**Interfaces:**
- Consumes: nothing new (pure module).
- Produces (Task 3 depends on these exact names):

```ts
export interface TrainingSessionRow {
  training_id: string;
  title: string | null;
  department: string | null;
  duration_minutes: number | null;
  location: string | null;
  training_date: string;            // ISO timestamptz from Postgres
  trainer_names: string[] | null;
  total_participants: number | null;
}
export interface TrainingParticipantRow {
  training_id: string;
  employee_id: string | null;
  colleague_name: string | null;
  position: string | null;
  section: string | null;
  department: string | null;
}
export interface TrainingQueryFilters {
  date_from?: string;
  date_to?: string;
  department?: string;
  employee?: string;
  detail?: 'summary' | 'sessions' | 'participants';
}
export function aggregateTrainingData(
  sessions: TrainingSessionRow[],
  participants: TrainingParticipantRow[],
  filters: TrainingQueryFilters,
  truncated: boolean,
): Record<string, unknown>
```

Result object shape (consumed by the model, so keys are stable API):
`filters_applied`, `summary` (`total_sessions`, `total_hours`, `total_attendances`, `distinct_participants`, `distinct_trainers`, `departments_covered`), `by_department` (array, only when no department filter), `sessions` (when detail != 'summary'), each with `participants` array when detail == 'participants'), `employee_attendance` (when employee filter), `no_training_records_found: true` (when empty), `truncated: true` (when caps hit).

- [ ] **Step 1: Write the failing tests**

Append to `training-aggregator.test.ts`:

```ts
import {
  aggregateTrainingData,
  type TrainingSessionRow,
  type TrainingParticipantRow,
} from './training-aggregator.ts';

const S = (over: Partial<TrainingSessionRow>): TrainingSessionRow => ({
  training_id: 'TRN-1', title: 'Fire Safety', department: 'Front Office',
  duration_minutes: 60, location: 'Meeting Room', training_date: '2026-07-25T10:00:00+00:00',
  trainer_names: ['Alice Smith'], total_participants: 2, ...over,
});
const P = (over: Partial<TrainingParticipantRow>): TrainingParticipantRow => ({
  training_id: 'TRN-1', employee_id: 'E-100', colleague_name: 'Omar Ali',
  position: 'Agent', section: 'Reception', department: 'Front Office', ...over,
});

test('aggregate: hour totals, attendances, distinct participants and trainers', () => {
  const sessions = [
    S({ training_id: 'TRN-1', duration_minutes: 90, trainer_names: ['Alice Smith', 'Bob Lee'] }),
    S({ training_id: 'TRN-2', duration_minutes: 45, trainer_names: ['Alice Smith'] }),
  ];
  const participants = [
    P({ training_id: 'TRN-1', employee_id: 'E-100' }),
    P({ training_id: 'TRN-1', employee_id: 'E-101', colleague_name: 'Sara Khan' }),
    P({ training_id: 'TRN-2', employee_id: 'E-100' }),
  ];
  const r: any = aggregateTrainingData(sessions, participants, {}, false);
  assert.equal(r.summary.total_sessions, 2);
  assert.equal(r.summary.total_hours, 2.3);          // 135 min / 60 = 2.25 → 2.3
  assert.equal(r.summary.total_attendances, 3);
  assert.equal(r.summary.distinct_participants, 2);  // E-100, E-101
  assert.equal(r.summary.distinct_trainers, 2);      // Alice, Bob
  assert.equal(r.no_training_records_found, undefined);
});

test('aggregate: null durations and null trainer arrays are safe', () => {
  const r: any = aggregateTrainingData(
    [S({ duration_minutes: null, trainer_names: null })], [P({})], {}, false);
  assert.equal(r.summary.total_hours, 0);
  assert.equal(r.summary.distinct_trainers, 0);
});

test('aggregate: per-department breakdown only without department filter', () => {
  const sessions = [
    S({ training_id: 'TRN-1', department: 'Front Office', duration_minutes: 60 }),
    S({ training_id: 'TRN-2', department: 'Housekeeping', duration_minutes: 30 }),
  ];
  const r: any = aggregateTrainingData(sessions, [], {}, false);
  assert.equal(r.by_department.length, 2);
  const hk = r.by_department.find((d: any) => d.department === 'Housekeeping');
  assert.equal(hk.total_hours, 0.5);
  const filtered: any = aggregateTrainingData(sessions, [], { department: 'Front' }, false);
  assert.equal(filtered.by_department, undefined);
});

test('aggregate: employee filter restricts sessions and reports attendance', () => {
  const sessions = [S({ training_id: 'TRN-1' }), S({ training_id: 'TRN-2', title: 'Upselling' })];
  const participants = [
    P({ training_id: 'TRN-1', employee_id: 'E-100', colleague_name: 'Omar Ali' }),
    P({ training_id: 'TRN-2', employee_id: 'E-101', colleague_name: 'Sara Khan' }),
  ];
  const byId: any = aggregateTrainingData(sessions, participants, { employee: 'e-100' }, false);
  assert.equal(byId.summary.total_sessions, 1);
  assert.equal(byId.employee_attendance.length, 1);
  assert.equal(byId.employee_attendance[0].title, 'Fire Safety');
  const byName: any = aggregateTrainingData(sessions, participants, { employee: 'sara' }, false);
  assert.equal(byName.summary.total_sessions, 1);
  assert.equal(byName.employee_attendance[0].title, 'Upselling');
});

test('aggregate: detail levels control sessions/participants output', () => {
  const sessions = [S({})];
  const participants = [P({})];
  const summary: any = aggregateTrainingData(sessions, participants, { detail: 'summary' }, false);
  assert.equal(summary.sessions, undefined);
  const withSessions: any = aggregateTrainingData(sessions, participants, { detail: 'sessions' }, false);
  assert.equal(withSessions.sessions.length, 1);
  assert.equal(withSessions.sessions[0].participant_count, 1);
  assert.equal(withSessions.sessions[0].participants, undefined);
  const withPeople: any = aggregateTrainingData(sessions, participants, { detail: 'participants' }, false);
  assert.equal(withPeople.sessions[0].participants[0].colleague_name, 'Omar Ali');
});

test('aggregate: empty input → explicit no-records flag', () => {
  const r: any = aggregateTrainingData([], [], { department: 'Spa' }, false);
  assert.equal(r.no_training_records_found, true);
  assert.equal(r.summary.total_sessions, 0);
});

test('aggregate: truncated flag is passed through', () => {
  const r: any = aggregateTrainingData([S({})], [], {}, true);
  assert.equal(r.truncated, true);
});
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `node --test supabase/functions/chat-with-data/training-aggregator.test.ts`
Expected: Task 1 tests PASS; new tests FAIL (`aggregateTrainingData` not exported).

- [ ] **Step 3: Write the implementation**

Append to `training-aggregator.ts`:

```ts
export interface TrainingSessionRow {
  training_id: string;
  title: string | null;
  department: string | null;
  duration_minutes: number | null;
  location: string | null;
  training_date: string;
  trainer_names: string[] | null;
  total_participants: number | null;
}

export interface TrainingParticipantRow {
  training_id: string;
  employee_id: string | null;
  colleague_name: string | null;
  position: string | null;
  section: string | null;
  department: string | null;
}

export interface TrainingQueryFilters {
  date_from?: string;
  date_to?: string;
  department?: string;
  employee?: string;
  detail?: 'summary' | 'sessions' | 'participants';
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function summarize(sessions: TrainingSessionRow[], participants: TrainingParticipantRow[]) {
  const minutes = sessions.reduce((sum, s) => sum + (s.duration_minutes ?? 0), 0);
  const participantIds = new Set(
    participants.map((p) => (p.employee_id ?? '').toLowerCase()).filter(Boolean),
  );
  const trainerNames = new Set(
    sessions.flatMap((s) => s.trainer_names ?? []).map((t) => t.trim()).filter(Boolean),
  );
  return {
    total_sessions: sessions.length,
    total_hours: round1(minutes / 60),
    total_attendances: participants.length,
    distinct_participants: participantIds.size,
    distinct_trainers: trainerNames.size,
    departments_covered: [...new Set(sessions.map((s) => s.department).filter(Boolean))],
  };
}

function sessionView(
  s: TrainingSessionRow,
  participants: TrainingParticipantRow[],
  includePeople: boolean,
) {
  const people = participants.filter((p) => p.training_id === s.training_id);
  const view: Record<string, unknown> = {
    training_id: s.training_id,
    date: s.training_date,
    title: s.title,
    department: s.department,
    duration_minutes: s.duration_minutes ?? 0,
    location: s.location,
    trainers: s.trainer_names ?? [],
    participant_count: people.length,
  };
  if (includePeople) {
    view.participants = people.map((p) => ({
      employee_id: p.employee_id,
      colleague_name: p.colleague_name,
      position: p.position,
      section: p.section,
      department: p.department,
    }));
  }
  return view;
}

export function aggregateTrainingData(
  sessions: TrainingSessionRow[],
  participants: TrainingParticipantRow[],
  filters: TrainingQueryFilters,
  truncated: boolean,
): Record<string, unknown> {
  let scopedSessions = sessions;
  let scopedParticipants = participants;
  let employeeRows: TrainingParticipantRow[] = [];

  if (filters.employee) {
    const needle = filters.employee.trim().toLowerCase();
    employeeRows = participants.filter((p) =>
      (p.employee_id ?? '').toLowerCase() === needle ||
      (p.colleague_name ?? '').toLowerCase().includes(needle)
    );
    const attendedIds = new Set(employeeRows.map((p) => p.training_id));
    scopedSessions = sessions.filter((s) => attendedIds.has(s.training_id));
    scopedParticipants = participants.filter((p) => attendedIds.has(p.training_id));
  }

  const detail = filters.detail ?? 'summary';
  const result: Record<string, unknown> = {
    filters_applied: {
      date_from: filters.date_from ?? null,
      date_to: filters.date_to ?? null,
      department: filters.department ?? null,
      employee: filters.employee ?? null,
      detail,
    },
    summary: summarize(scopedSessions, scopedParticipants),
  };

  if (scopedSessions.length === 0) {
    result.no_training_records_found = true;
    return result;
  }

  if (!filters.department) {
    const byDept = new Map<string, TrainingSessionRow[]>();
    for (const s of scopedSessions) {
      const key = s.department ?? 'Unknown';
      byDept.set(key, [...(byDept.get(key) ?? []), s]);
    }
    result.by_department = [...byDept.entries()].map(([department, deptSessions]) => {
      const ids = new Set(deptSessions.map((s) => s.training_id));
      const deptParticipants = scopedParticipants.filter((p) => ids.has(p.training_id));
      return { department, ...summarize(deptSessions, deptParticipants) };
    });
  }

  if (detail !== 'summary') {
    result.sessions = scopedSessions.map((s) =>
      sessionView(s, scopedParticipants, detail === 'participants')
    );
  }

  if (filters.employee && employeeRows.length > 0) {
    result.employee_attendance = employeeRows.map((row) => {
      const s = scopedSessions.find((x) => x.training_id === row.training_id);
      return {
        training_id: row.training_id,
        date: s?.training_date ?? null,
        title: s?.title ?? null,
        department: s?.department ?? null,
        duration_minutes: s?.duration_minutes ?? 0,
        employee_id: row.employee_id,
        colleague_name: row.colleague_name,
      };
    });
  }

  if (truncated) result.truncated = true;
  return result;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test supabase/functions/chat-with-data/training-aggregator.test.ts`
Expected: all 13 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/chat-with-data/training-aggregator.ts supabase/functions/chat-with-data/training-aggregator.test.ts
git commit -m "feat(sera): pure training aggregation with department/employee/detail handling"
```

---

### Task 3: `TrainingQueryService` (tool schema + Supabase queries)

**Files:**
- Create: `supabase/functions/chat-with-data/training-query-service.ts`

**Interfaces:**
- Consumes: `buildDateRange`, `aggregateTrainingData`, row/filter types from `training-aggregator.ts` (Task 1–2 signatures).
- Produces (Task 4 depends on these):
  - `class TrainingQueryService`
  - `getAvailableFunctions(): any[]` — returns the one tool schema, same shape as `SearchService.getAvailableFunctions()`.
  - `async executeFunction(functionName: string, args: any): Promise<string>` — returns a JSON string for the tool message; on DB failure returns `JSON.stringify({ error: "Training data is temporarily unavailable. Tell the user you could not access the training records right now." })` — it never throws.
  - `TRAINING_TOOL_NAME = 'query_training_records'` exported const.

No unit test for this file (thin DB glue over the tested aggregator; covered by Task 6 live verification).

- [ ] **Step 1: Write the implementation**

Create `supabase/functions/chat-with-data/training-query-service.ts`:

```ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.2';
import {
  aggregateTrainingData,
  buildDateRange,
  TrainingParticipantRow,
  TrainingQueryFilters,
  TrainingSessionRow,
} from './training-aggregator.ts';

export const TRAINING_TOOL_NAME = 'query_training_records';

const SESSION_CAP = 500;
const PARTICIPANT_CAP = 2000;

const UNAVAILABLE = JSON.stringify({
  error: 'Training data is temporarily unavailable. Tell the user you could not access the training records right now.',
});

export class TrainingQueryService {
  getAvailableFunctions() {
    return [
      {
        name: TRAINING_TOOL_NAME,
        description:
          "Query the hotel's staff training records (sessions registered through the dashboard). Returns EXACT computed statistics: total sessions, total training hours, attendances, distinct participants, distinct trainers, per-department breakdown, and optional session/participant details. ALWAYS use this tool for ANY question about staff training hours, sessions, participants, attendees, or trainers. Never estimate training numbers yourself.",
        parameters: {
          type: 'object',
          properties: {
            date_from: {
              type: 'string',
              description: 'Start date (inclusive), format YYYY-MM-DD, Dubai time. Omit for no lower bound.',
            },
            date_to: {
              type: 'string',
              description: 'End date (inclusive), format YYYY-MM-DD, Dubai time. Omit for no upper bound.',
            },
            department: {
              type: 'string',
              description: "Department name, partial match allowed (e.g. 'Front Office', 'Housekeeping', 'F&B').",
            },
            employee: {
              type: 'string',
              description: "Employee ID (exact) or colleague name (partial) to get one person's training history.",
            },
            detail: {
              type: 'string',
              enum: ['summary', 'sessions', 'participants'],
              description:
                'summary (default): totals only. sessions: also list each session. participants: also include participant names per session.',
            },
          },
          required: [],
        },
      },
    ];
  }

  async executeFunction(functionName: string, args: any): Promise<string> {
    if (functionName !== TRAINING_TOOL_NAME) {
      return JSON.stringify({ error: `Unknown function: ${functionName}` });
    }

    try {
      const filters: TrainingQueryFilters = {
        date_from: typeof args?.date_from === 'string' && args.date_from ? args.date_from : undefined,
        date_to: typeof args?.date_to === 'string' && args.date_to ? args.date_to : undefined,
        department: typeof args?.department === 'string' && args.department.trim() ? args.department.trim() : undefined,
        employee: typeof args?.employee === 'string' && args.employee.trim() ? args.employee.trim() : undefined,
        detail: ['summary', 'sessions', 'participants'].includes(args?.detail) ? args.detail : 'summary',
      };

      const range = buildDateRange(filters.date_from, filters.date_to);
      if (range.error) {
        return JSON.stringify({ error: range.error });
      }

      const supabase = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      );

      let query = supabase
        .from('training_sessions')
        .select('training_id, title, department, duration_minutes, location, training_date, trainer_names, total_participants')
        .order('training_date', { ascending: false })
        .limit(SESSION_CAP);
      if (range.fromISO) query = query.gte('training_date', range.fromISO);
      if (range.toExclusiveISO) query = query.lt('training_date', range.toExclusiveISO);
      if (filters.department) query = query.ilike('department', `%${filters.department}%`);

      const { data: sessions, error: sessionsError } = await query;
      if (sessionsError) {
        console.error('❌ query_training_records sessions query failed:', sessionsError);
        return UNAVAILABLE;
      }

      const sessionRows = (sessions ?? []) as TrainingSessionRow[];

      // Department filter matched nothing → tell the model which departments exist.
      if (sessionRows.length === 0 && filters.department) {
        const { data: deptRows } = await supabase
          .from('training_sessions')
          .select('department')
          .limit(SESSION_CAP);
        const departments = [...new Set((deptRows ?? []).map((r: any) => r.department).filter(Boolean))];
        return JSON.stringify({
          filters_applied: filters,
          no_training_records_found: true,
          departments_available: departments,
        });
      }

      let participantRows: TrainingParticipantRow[] = [];
      if (sessionRows.length > 0) {
        const ids = sessionRows.map((s) => s.training_id);
        const { data: participants, error: participantsError } = await supabase
          .from('training_participants')
          .select('training_id, employee_id, colleague_name, position, section, department')
          .in('training_id', ids)
          .limit(PARTICIPANT_CAP);
        if (participantsError) {
          console.error('❌ query_training_records participants query failed:', participantsError);
          return UNAVAILABLE;
        }
        participantRows = (participants ?? []) as TrainingParticipantRow[];
      }

      const truncated = sessionRows.length >= SESSION_CAP || participantRows.length >= PARTICIPANT_CAP;
      const result = aggregateTrainingData(sessionRows, participantRows, filters, truncated);
      if (truncated) {
        result.truncation_note = 'Result capped. Ask the user to narrow the date range for exact totals.';
      }
      if (range.swapped) {
        result.note = 'date_from and date_to were reversed and have been swapped.';
      }

      console.log('🎓 query_training_records:', {
        filters,
        sessions: sessionRows.length,
        participants: participantRows.length,
        truncated,
      });
      return JSON.stringify(result);
    } catch (error) {
      console.error('❌ query_training_records failed:', error);
      return UNAVAILABLE;
    }
  }
}
```

- [ ] **Step 2: Sanity-check the module parses**

Run: `node -e "import('./supabase/functions/chat-with-data/training-query-service.ts').then(() => console.log('parsed')).catch(e => console.log('import result:', e.message.slice(0,100)))"`
Expected: the only failure mentioned is the `https://esm.sh/...` URL import (Node can't fetch remote modules) — NOT a `SyntaxError`. Task 6's deploy validates the module end-to-end under Deno.

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/chat-with-data/training-query-service.ts
git commit -m "feat(sera): TrainingQueryService tool schema and mirror-table queries"
```

---

### Task 4: Wire the tool into `FunctionCallHandler` and fix forced web-search hijack

**Files:**
- Modify: `supabase/functions/chat-with-data/function-call-handler.ts`
- Modify: `supabase/functions/chat-with-data/search-decision-engine.ts`

**Interfaces:**
- Consumes: `TrainingQueryService`, `TRAINING_TOOL_NAME` from Task 3.
- Produces: `getAvailableTools()` now includes the training tool; `SearchDecisionResult` gains `isTrainingQuery: boolean`; `determineToolChoice` never forces `search_web` for training questions.

- [ ] **Step 1: Register and dispatch the tool in `function-call-handler.ts`**

At the top, add the import:

```ts
import { TrainingQueryService, TRAINING_TOOL_NAME } from './training-query-service.ts';
```

In the class, add the field and constructor line:

```ts
  private trainingQueryService: TrainingQueryService;

  constructor() {
    this.searchService = new SearchService();
    this.trainingQueryService = new TrainingQueryService();
  }
```

In `getAvailableTools()`, include the training functions:

```ts
  getAvailableTools(): any[] {
    const searchFunctions = this.searchService.getAvailableFunctions();
    const trainingFunctions = this.trainingQueryService.getAvailableFunctions();
    const actionFunctions = this.getActionFunctions();

    return [...searchFunctions, ...trainingFunctions, ...actionFunctions];
  }
```

In `executeToolCalls`, add a branch BEFORE the `else` fallback (after the `isActionFunction` branch):

```ts
      } else if (functionName === TRAINING_TOOL_NAME) {
        const content = await this.trainingQueryService.executeFunction(functionName, functionArgs);
        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content
        });
      } else {
```

(`executeFunction` never throws — it returns a JSON error string on failure, so no try/catch is needed here.)

- [ ] **Step 2: Stop training questions from force-triggering `search_web` in `search-decision-engine.ts`**

Add `isTrainingQuery` to the interface:

```ts
export interface SearchDecisionResult {
  requiresWebsiteSearch: boolean;
  hasRichDatabaseContext: boolean;
  searchReason: string;
  isTrainingQuery: boolean;
}
```

In `analyzeSearchRequirement`, before the "Decision logic" comment, add:

```ts
    // Training questions must stay eligible for the query_training_records tool —
    // never force search_web for them.
    const trainingKeywords = [
      'training', 'trainer', 'trainers', 'trainee', 'attended', 'attendance',
      'تدريب', 'مدرب', 'مدربين', 'تدريبية', 'حضور'
    ];
    const isTrainingQuery = trainingKeywords.some(keyword =>
      message.toLowerCase().includes(keyword.toLowerCase())
    );
```

Then gate the three `requiresWebsiteSearch = true` branches by wrapping the existing decision logic:

```ts
    if (isTrainingQuery) {
      requiresWebsiteSearch = false;
      searchReason = 'Training question — leave tool choice to the model';
    } else if (!hasRichDatabaseContext && hasRealTimeRequest) {
```

(i.e. the previous `if (!hasRichDatabaseContext && hasRealTimeRequest)` becomes `else if`; the other two `else if` branches stay unchanged.)

Include `isTrainingQuery` in the returned object and in the `console.log('📊 Search decision:', {...})` payload:

```ts
    return {
      requiresWebsiteSearch,
      hasRichDatabaseContext,
      searchReason,
      isTrainingQuery
    };
```

`determineToolChoice` needs no change — with `requiresWebsiteSearch` false it already returns `'auto'`.

- [ ] **Step 3: Verify no other constructor of these classes breaks**

Run: `grep -rn "new FunctionCallHandler\|analyzeSearchRequirement\|SearchDecisionResult" supabase/functions/chat-with-data --include="*.ts" | grep -v "\-old"`
Expected: only `openai-service.ts` (constructor with no args — unchanged) and the definitions themselves.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/chat-with-data/function-call-handler.ts supabase/functions/chat-with-data/search-decision-engine.ts
git commit -m "feat(sera): register query_training_records tool and unforce web search for training questions"
```

---

### Task 5: Prompt update, dead-fetch removal, and reference-date fix

**Files:**
- Modify: `supabase/functions/chat-with-data/system-prompt-builder.ts`
- Modify: `supabase/functions/chat-with-data/index.ts`
- Modify: `supabase/functions/chat-with-data/context-section-builder.ts`
- Modify: `supabase/functions/chat-with-data/context-data-stats-builder.ts`
- Modify: `supabase/functions/chat-with-data/data-availability-checker.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks (prompt text references the tool name `query_training_records` as a string).
- Produces: `allData` no longer has a `conductedTraining` key — all remaining live-path consumers are updated in this same task.

- [ ] **Step 1: Update the evidence base + capabilities in `system-prompt-builder.ts`**

Replace the line:

```
- Conducted Training — past staff training summaries
```

with:

```
- Training Records — staff training sessions, hours, participants and trainers, ONLY via the query_training_records tool
```

After the `🔧 RETRIEVAL PRIORITY:` block (after the line `4. General hospitality knowledge as last resort, with a clear disclaimer`), insert:

```
🎓 TRAINING QUESTIONS — MANDATORY TOOL:
- For ANY question about staff training (hours, sessions, who attended, participants, trainers, by department or period): ALWAYS call query_training_records.
- Use ONLY the numbers the tool returns. Never estimate or compute training totals yourself.
- If the tool reports no_training_records_found, say clearly that no training records exist for that period/filter.
- Training records cover sessions registered through the dashboard's Hotel Training page.
```

In the `🎯 CAPABILITIES:` list, add:

```
- Query staff training records (hours, participants, trainers) via query_training_records
```

- [ ] **Step 2: Remove the dead `Conducted Training` fetch from `index.ts`**

Change lines 87–105 destructuring and fetch array — remove the `conductedTraining` element and its query:

```ts
    const [hotelReviews, chatHistory, infoSummary, longTermMemory, documentContext, recentDocuments] = await Promise.allSettled([
      supabase.from('Hotel Reviews').select('*').order('created_at', { ascending: false }).limit(100),
      supabase.from('Chat History').select('*').order('created_at', { ascending: false }).limit(20),
      supabase.from('Info Summary').select('*').order('created_at', { ascending: false }).limit(10),
      supabase.from('LongTermMemory').select('*').order('created_at', { ascending: false }).limit(20),
      supabase.rpc('get_recent_document_context', { limit_count: 10 }),
      supabase.from('uploaded_documents').select('*').eq('upload_status', 'processed').order('last_accessed', { ascending: false }).limit(5)
    ]);

    const allData = {
      hotelReviews,
      chatHistory,
      infoSummary,
      longTermMemory,
      documentContext,
      recentDocuments
    };
```

- [ ] **Step 3: Remove the training render block and fix the date in `context-section-builder.ts`**

Delete the `// Training Records` block (the `if (data.conductedTraining?...)` section, currently lines 99–108).

Add the import at the top of the file:

```ts
import { formatDubaiTimestamp } from './timezone-utils.ts';
```

Replace the hard-coded date line (currently line 172):

```
- Today's reference date is January 2, 2025 (for "recent" calculations only)
```

with:

```
- Today's reference date is ${formatDubaiTimestamp(new Date())} (for "recent" calculations only)
```

(The surrounding string is already a template literal — check that the line sits inside the backtick block of `buildInstructionsSection`.)

- [ ] **Step 4: Drop `conductedTraining` from `context-data-stats-builder.ts`**

Remove the line `{ name: 'Training Records', data: data.conductedTraining, key: 'conductedTraining' },` from the `sources` array, and remove the three-line `if (data.conductedTraining?...)` block from `getDataSourcesList`.

- [ ] **Step 5: Mark training always-available in `data-availability-checker.ts`**

Replace:

```ts
    if (availableData?.conductedTraining?.status === 'fulfilled' && availableData.conductedTraining.value?.data?.length > 0) {
      availableDataSources.push(this.AVAILABLE_DATA_TYPES.TRAINING);
    }
```

with:

```ts
    // Training data is served on demand by the query_training_records tool.
    availableDataSources.push(this.AVAILABLE_DATA_TYPES.TRAINING);
```

- [ ] **Step 6: Verify no live-path references to `conductedTraining` remain**

Run: `grep -rn "conductedTraining\|Conducted Training" supabase/functions/chat-with-data --include="*.ts" | grep -v "\-old" | grep -v "enhanced-data-service\|data-service.ts\|smart-context-builder\|data-section-builders\|data-stats-logger\|uncertainty-manager\|context-builder.ts\|base-context-builder\|types.ts"`
Expected: no output. (The excluded files are dead code per the spec — untouched deliberately.)

- [ ] **Step 7: Run the unit tests once more (regression)**

Run: `node --test supabase/functions/chat-with-data/training-aggregator.test.ts`
Expected: all 13 PASS.

- [ ] **Step 8: Commit**

```bash
git add supabase/functions/chat-with-data/system-prompt-builder.ts supabase/functions/chat-with-data/index.ts supabase/functions/chat-with-data/context-section-builder.ts supabase/functions/chat-with-data/context-data-stats-builder.ts supabase/functions/chat-with-data/data-availability-checker.ts
git commit -m "feat(sera): advertise training tool in prompt, drop dead Conducted Training fetch, fix reference date"
```

---

### Task 6: Deploy and live verification

**Files:**
- None created/modified (deployment + verification).

**Interfaces:**
- Consumes: the complete `chat-with-data` function from Tasks 1–5.

- [ ] **Step 1: Establish ground truth from the mirror**

Using the Supabase MCP `execute_sql` tool (read-only queries) against the project's database:

```sql
SELECT count(*) AS sessions,
       round(sum(duration_minutes)/60.0, 1) AS hours,
       min(training_date) AS earliest,
       max(training_date) AS latest
FROM training_sessions;

SELECT department, count(*) AS sessions, round(sum(duration_minutes)/60.0, 1) AS hours
FROM training_sessions
GROUP BY department;
```

Record the numbers. If the table is empty, note it — verification then checks the "no records" honesty path instead, and a test session should be registered through the dashboard's Register Training tab (or an INSERT into the mirror) to exercise the positive path.

- [ ] **Step 2: Deploy `chat-with-data`**

Deploy with the Supabase MCP `deploy_edge_function` tool, passing **every `.ts` file** in `supabase/functions/chat-with-data/` (the function has ~50 modules; include them all, entrypoint `index.ts`). Exclude `training-aggregator.test.ts`.
Fallback if MCP deploy is unavailable: `npx supabase functions deploy chat-with-data` (needs `SUPABASE_ACCESS_TOKEN` and the project ref).

- [ ] **Step 3: Verify the tool end-to-end with curl**

Get the function URL and anon key via MCP `get_project_url` / `get_publishable_keys`, then:

```bash
curl -s -X POST "<PROJECT_URL>/functions/v1/chat-with-data" \
  -H "Authorization: Bearer <ANON_KEY>" \
  -H "apikey: <ANON_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"message":"How many total training hours were completed in the last 7 days, for how many people and how many trainers?","messageId":"verify-training-1"}'
```

Expected: HTTP 200; the reply text contains the exact totals matching Step 1's SQL for the last 7 days (re-run the SQL with `WHERE training_date >= now() - interval '7 days'` to compare). Also check the function logs (MCP `get_logs`, service `edge-function`) for the `🎓 query_training_records:` log line proving the tool was called.

- [ ] **Step 4: Verify the honesty path and department filter**

```bash
curl -s -X POST "<PROJECT_URL>/functions/v1/chat-with-data" \
  -H "Authorization: Bearer <ANON_KEY>" -H "apikey: <ANON_KEY>" -H "Content-Type: application/json" \
  -d '{"message":"How many training hours did the Engineering department complete in January 2020?","messageId":"verify-training-2"}'
```

Expected: the reply clearly states no training records were found for that period (no invented numbers).

```bash
curl -s -X POST "<PROJECT_URL>/functions/v1/chat-with-data" \
  -H "Authorization: Bearer <ANON_KEY>" -H "apikey: <ANON_KEY>" -H "Content-Type: application/json" \
  -d '{"message":"List the training sessions for the Front Office department this month with their trainers.","messageId":"verify-training-3"}'
```

Expected: sessions listed match `SELECT * FROM training_sessions WHERE department ILIKE '%front%'` for the current month.

Then the individual-level question (spec verification case c) — take a real session title from Step 1's data:

```bash
curl -s -X POST "<PROJECT_URL>/functions/v1/chat-with-data" \
  -H "Authorization: Bearer <ANON_KEY>" -H "apikey: <ANON_KEY>" -H "Content-Type: application/json" \
  -d '{"message":"Which colleagues attended the most recent training session, and who was the trainer?","messageId":"verify-training-4"}'
```

Expected: the named colleagues match `SELECT colleague_name FROM training_participants WHERE training_id = (SELECT training_id FROM training_sessions ORDER BY training_date DESC LIMIT 1)`.

- [ ] **Step 5: Verify in the dashboard UI**

Ask Sera in the browser panel (user-visible check): "How many total training hours has each department done in the last 30 days?" — confirm a per-department answer with plausible exact numbers and no hallucinated departments.

- [ ] **Step 6: Commit any deployment artifacts and report**

If deployment changed no tracked files, nothing to commit. Report the verification evidence (SQL numbers vs Sera's answers) to the user.
