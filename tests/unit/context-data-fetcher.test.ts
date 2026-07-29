import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveDateBounds } from '../../supabase/functions/chat-with-data/context-data-fetcher.ts';

test('maps YYYY-MM-DD bounds to Dubai ISO range and date keys', () => {
  const b = resolveDateBounds({ startDate: '2026-07-26', endDate: '2026-07-28' });
  assert.equal(b.fromISO, '2026-07-26T00:00:00+04:00');
  assert.equal(b.toExclusiveISO, '2026-07-29T00:00:00+04:00'); // exclusive upper bound
  assert.equal(b.fromDateKey, '2026-07-26');
  assert.equal(b.toDateKey, '2026-07-28');
});

test('returns empty bounds when analysis has no dates', () => {
  const b = resolveDateBounds({});
  assert.equal(b.fromISO, undefined);
  assert.equal(b.toDateKey, undefined);
});

test('clamps invalid endDate like 2026-02-31 to a real date key', () => {
  const b = resolveDateBounds({ startDate: '2026-02-01', endDate: '2026-02-31' });
  assert.equal(b.toDateKey, '2026-02-28'); // query-analyzer emits -31 blindly; clamp, don't error
});
