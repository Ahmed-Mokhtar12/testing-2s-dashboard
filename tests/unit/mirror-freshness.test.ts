import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isMirrorFresh,
  MIRROR_TTL_MS,
  type MirrorKey,
} from '../../src/lib/sharepoint-mirror.ts';

// isMirrorFresh decides whether the Hotel Training page renders from Postgres
// (~100 ms) or from a cold edge function (measured 2.6-3.7 s). Both wrong answers
// are bad in different ways, which is why every branch is asserted here:
//
//   too eager  -> a colleague added directly in SharePoint stays invisible past
//                 the TTL, and nothing in the UI hints why;
//   too strict -> every page load pays the cold-start path with a perfectly good
//                 mirror row sitting in the table.
const NOW = 1_700_000_000_000;
const iso = (ms: number) => new Date(ms).toISOString();

const KEYS: MirrorKey[] = ['colleagues', 'trainers', 'columns'];

test('every mirror key has a positive TTL', () => {
  // Every "not fresh past the TTL" assertion below is vacuous at TTL 0.
  for (const key of KEYS) {
    assert.ok(MIRROR_TTL_MS[key] > 0, `${key} has no TTL`);
  }
  // The keys are the ones the database CHECK constraint allows
  // (supabase/migrations/20260802230000_sharepoint_mirror.sql). A key here that
  // the table refuses would write nothing and read nothing, silently.
  assert.deepEqual(Object.keys(MIRROR_TTL_MS).sort(), [...KEYS].sort());
});

test('a payload inside its TTL is fresh, and one past it is not', () => {
  for (const key of KEYS) {
    const ttl = MIRROR_TTL_MS[key];

    assert.equal(isMirrorFresh(iso(NOW), key, NOW), true, `${key}: just written`);
    assert.equal(isMirrorFresh(iso(NOW - ttl + 1000), key, NOW), true, `${key}: 1 s inside`);

    // The boundary is exclusive: exactly at the TTL it has expired.
    assert.equal(isMirrorFresh(iso(NOW - ttl), key, NOW), false, `${key}: exactly at the TTL`);
    assert.equal(isMirrorFresh(iso(NOW - ttl - 1000), key, NOW), false, `${key}: 1 s past`);
  }
});

test('the TTLs are not all the same value by accident', () => {
  // colleagues is deliberately shorter than the other two: it is the one dataset
  // that changes without an admin touching the SharePoint schema. If a future
  // edit flattens these to one number, that reasoning is gone and this fails.
  assert.ok(
    MIRROR_TTL_MS.colleagues < MIRROR_TTL_MS.trainers,
    'colleagues must expire sooner than trainers — it changes far more often',
  );
  assert.ok(MIRROR_TTL_MS.colleagues < MIRROR_TTL_MS.columns);
});

test('anything unreadable is treated as not fresh, never as fresh', () => {
  // Fail closed. Each of these must send the caller to the edge function, whose
  // behaviour is already correct — never render from a timestamp nobody parsed.
  for (const bad of [null, undefined, '', 'yesterday', 'NaN', '2026-13-45T99:99:99Z']) {
    assert.equal(isMirrorFresh(bad, 'colleagues', NOW), false, `${String(bad)} must not be fresh`);
  }
});

test('a fetched_at in the future is rejected rather than trusted', () => {
  // fetched_at is stamped by the database. Ahead of the browser's clock means the
  // two disagree, and treating it as fresh would silently extend the TTL by the
  // skew for as long as the skew lasted.
  assert.equal(isMirrorFresh(iso(NOW + 1000), 'colleagues', NOW), false);
  assert.equal(isMirrorFresh(iso(NOW + 24 * 60 * 60 * 1000), 'trainers', NOW), false);
});

test('the default `now` is the real clock, not a frozen constant', () => {
  // The production call sites pass no `now`. A default that had been pinned to a
  // literal would make every payload look ancient (or eternally fresh) in the
  // browser while every test above still passed.
  assert.equal(isMirrorFresh(new Date().toISOString(), 'colleagues'), true);
  assert.equal(
    isMirrorFresh(new Date(Date.now() - MIRROR_TTL_MS.colleagues - 5000).toISOString(), 'colleagues'),
    false,
  );
});
