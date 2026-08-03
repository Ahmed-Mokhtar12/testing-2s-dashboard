import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapUilItemToTrainer, dedupeAndSortTrainers } from '../../supabase/functions/_shared/uil-mapper.ts';

test('maps a UIL item with Title + EMail to a trainer entry with lowercased mail', () => {
  const entry = mapUilItemToTrainer('7', { Title: 'Ahmed Mokhtar', EMail: 'Ahmed.Mokhtar@2SeasonsHotels.com' });
  assert.deepEqual(entry, { id: '7', displayName: 'Ahmed Mokhtar', mail: 'ahmed.mokhtar@2seasonshotels.com' });
});

test('falls back to a claims-format Name field when EMail is empty', () => {
  const entry = mapUilItemToTrainer(12, {
    Title: 'Amir Monir',
    EMail: '',
    Name: 'i:0#.f|membership|amir.monir@2seasonshotels.com',
  });
  assert.deepEqual(entry, { id: '12', displayName: 'Amir Monir', mail: 'amir.monir@2seasonshotels.com' });
});

test('returns null for an item with no email-like identity value (system/group row)', () => {
  const entry = mapUilItemToTrainer('3', { Title: 'Everyone', ContentType: 'DomainGroup' });
  assert.equal(entry, null);
});

test('returns null when the only string fields present contain no "@"', () => {
  const entry = mapUilItemToTrainer('4', { Title: 'Site Owners Group', Name: 'i:0#.f|membership|no-at-sign' });
  assert.equal(entry, null);
});

test('dedupe keeps the first occurrence by lowercased mail and sorts by displayName', () => {
  const trainers = [
    { id: '2', displayName: 'Zara Ali', mail: 'zara.ali@2seasonshotels.com' },
    { id: '1', displayName: 'Ahmed Mokhtar', mail: 'ahmed.mokhtar@2seasonshotels.com' },
    { id: '9', displayName: 'Ahmed Mokhtar (duplicate row)', mail: 'AHMED.MOKHTAR@2seasonshotels.com' },
  ];
  const result = dedupeAndSortTrainers(trainers);
  assert.deepEqual(result, [
    { id: '1', displayName: 'Ahmed Mokhtar', mail: 'ahmed.mokhtar@2seasonshotels.com' },
    { id: '2', displayName: 'Zara Ali', mail: 'zara.ali@2seasonshotels.com' },
  ]);
});
