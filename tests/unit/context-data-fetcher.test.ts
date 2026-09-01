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

import { fetchDashboardSnapshot } from '../../supabase/functions/chat-with-data/context-data-fetcher.ts';

// LongTermMemory has no user_id and is staff-wide: reading it into the snapshot injected
// every colleague's Sera turns into every other user's prompt (audit E4). It is also read
// by the WhatsApp Live One n8n workflow, so the WRITE stays (backlog B19); only this read goes.
test('the snapshot never reads LongTermMemory', async () => {
  const tables: string[] = [];
  const chain: any = new Proxy({}, { get: (_t, prop) => prop === 'then'
    ? (resolve: (v: unknown) => void) => resolve({ data: [], count: 0, error: null })
    : () => chain });
  const fake = { from: (table: string) => { tables.push(table); return chain; } };
  const snap = await fetchDashboardSnapshot(fake, {});
  assert.equal(tables.includes('LongTermMemory'), false);
  assert.equal(tables.length, 7);
  assert.equal('memory' in snap, false);
});
