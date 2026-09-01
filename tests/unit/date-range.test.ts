import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shiftDateKey, presetDateKeys } from '../../src/lib/date-range.ts';
import { dubaiDateKey } from '../../src/utils/timezone.ts';

// The old presets fed a toZonedTime()-shifted Date into helpers that converted to Dubai
// AGAIN, so any browser not at UTC+4 got the wrong day (audit A4) — invisible to Playwright
// on this +4 server. Keys in, keys out; no Date arithmetic.
test('presets are derived from a Dubai date key', () => {
  assert.deepEqual(presetDateKeys('yesterday', '2026-09-02'), { fromKey: '2026-09-01', toKey: '2026-09-01' });
  assert.deepEqual(presetDateKeys('last7', '2026-09-02'), { fromKey: '2026-08-27', toKey: '2026-09-02' }); // 7 days, not 8
  assert.deepEqual(presetDateKeys('last30', '2026-03-01'), { fromKey: '2026-01-31', toKey: '2026-03-01' });
  assert.deepEqual(presetDateKeys('custom', '2026-09-02', { fromKey: '2026-08-01', toKey: '2026-08-03' }), { fromKey: '2026-08-01', toKey: '2026-08-03' });
  assert.deepEqual(presetDateKeys('custom', '2026-09-02'), { fromKey: '2026-09-01', toKey: '2026-09-01' }); // custom without a range falls back to yesterday
});

test('shiftDateKey crosses month and year boundaries', () => {
  assert.equal(shiftDateKey('2026-01-01', -1), '2025-12-31');
  assert.equal(shiftDateKey('2026-02-28', 1), '2026-03-01');
});

test('the Dubai key of an instant is timezone-independent', () => {
  assert.equal(dubaiDateKey('2026-08-31T21:30:00Z'), '2026-09-01');
});
