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
