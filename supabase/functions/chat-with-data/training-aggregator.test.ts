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
