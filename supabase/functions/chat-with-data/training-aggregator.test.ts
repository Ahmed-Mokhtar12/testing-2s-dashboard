import { test } from 'node:test';
import assert from 'node:assert';
import { buildDateRange } from './training-aggregator.ts';
import {
  aggregateTrainingData,
  type TrainingSessionRow,
  type TrainingParticipantRow,
} from './training-aggregator.ts';

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

test('aggregate: truncated flag appears even on empty results from filters', () => {
  const sessions = [
    S({ training_id: 'TRN-1', employee_id: 'E-100' }),
    S({ training_id: 'TRN-2', employee_id: 'E-101' }),
  ];
  const participants = [
    P({ training_id: 'TRN-1', employee_id: 'E-100' }),
    P({ training_id: 'TRN-2', employee_id: 'E-101', colleague_name: 'Sara Khan' }),
  ];
  const r: any = aggregateTrainingData(sessions, participants, { employee: 'nonexistent' }, true);
  assert.equal(r.no_training_records_found, true);
  assert.equal(r.truncated, true);
});
