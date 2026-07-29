import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aggregateRates } from '../../supabase/functions/chat-with-data/rates-aggregator.ts';

const row = (report_date: string, hotel: string, price_aed: number | null) => ({ report_date, hotel, price_aed });

test('per-hotel min/avg and cheapest hotel per day', () => {
  const s = aggregateRates([row('2026-07-28', 'Two Seasons', 400), row('2026-07-28', 'Hilton', 350), row('2026-07-29', 'Hilton', 500)]);
  assert.equal(s.days_covered, 2);
  assert.deepEqual(s.hotels.find(h => h.hotel === 'Hilton'), { hotel: 'Hilton', quotes: 2, min_aed: 350, avg_aed: 425 });
  assert.deepEqual(s.cheapest_by_day[0], { date: '2026-07-28', hotel: 'Hilton', price_aed: 350 });
});

test('null prices excluded from stats but hotels still listed', () => {
  const s = aggregateRates([row('2026-07-28', 'Hilton', null)]);
  assert.deepEqual(s.hotels[0], { hotel: 'Hilton', quotes: 1, min_aed: null, avg_aed: null });
  assert.deepEqual(s.cheapest_by_day, []);
});
