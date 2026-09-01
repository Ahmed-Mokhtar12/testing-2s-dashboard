import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeQueryIntelligently } from '../../supabase/functions/chat-with-data/query-analyzer.ts';

// 21:30 UTC on 1 Sep = 01:30 on 2 Sep in Dubai. The old code used the UTC calendar and
// answered "past 7 days" with a window that excluded the current Dubai day (audit E8).
const NOW = new Date('2026-09-01T21:30:00Z');

test('recent windows are computed on the Dubai calendar', () => {
  const a = analyzeQueryIntelligently('what happened in the past 7 days', NOW);
  assert.equal(a.endDate, '2026-09-02');
  assert.equal(a.startDate, '2026-08-26');
  assert.equal(analyzeQueryIntelligently('recent reviews', NOW).endDate, '2026-09-02');
});

test('this year / last year use the Dubai year', () => {
  const nye = new Date('2026-12-31T21:00:00Z'); // already 2027-01-01 01:00 in Dubai
  assert.equal(analyzeQueryIntelligently('reviews this year', nye).startDate, '2027-01-01');
  assert.equal(analyzeQueryIntelligently('reviews last year', nye).startDate, '2026-01-01');
});
