import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aggregateReviews } from '../../supabase/functions/chat-with-data/reviews-aggregator.ts';

const row = (date: string, source: string, score: number | null) => ({ date, source, score, hotel: 'Two Seasons' });

test('averages and groups by source and month', () => {
  const s = aggregateReviews([row('2026-05-01', 'Google', 8), row('2026-05-10', 'Google', 6), row('2026-04-02', 'Booking.com', 10)]);
  assert.equal(s.total_reviews, 3);
  assert.equal(s.average_score, 8);
  assert.deepEqual(s.by_source.find(x => x.source === 'Google'), { source: 'Google', reviews: 2, average_score: 7 });
  assert.deepEqual(s.by_month.map(m => m.month), ['2026-04', '2026-05']);
});

test('null scores are excluded from averages but counted in totals', () => {
  const s = aggregateReviews([row('2026-05-01', 'Google', null), row('2026-05-02', 'Google', 9)]);
  assert.equal(s.total_reviews, 2);
  assert.equal(s.average_score, 9);
});

test('empty input', () => {
  const s = aggregateReviews([]);
  assert.equal(s.total_reviews, 0);
  assert.equal(s.average_score, null);
});
