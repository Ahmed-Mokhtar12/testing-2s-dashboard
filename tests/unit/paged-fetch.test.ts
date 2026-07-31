import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchAllWithCap } from '../../supabase/functions/chat-with-data/paged-fetch.ts';

// Stub modeling the SERVER's contract, not the code's assumptions: PostgREST
// returns at most `serverMaxRows` rows per request no matter how wide the
// requested range is, and `count: 'exact'` reports the full matching total.
// (The live truncation bug survived the old tests precisely because those
// stubs returned whatever span the code asked for.)
function serverStub(totalRows: number, opts: { serverMaxRows?: number; failOnPage?: number } = {}) {
  const serverMaxRows = opts.serverMaxRows ?? 1000;
  const all = Array.from({ length: totalRows }, (_, i) => ({ id: totalRows - i }));
  const calls: Array<{ from: number; to: number; withCount: boolean }> = [];
  const fetchPage = async (from: number, to: number, withCount: boolean) => {
    calls.push({ from, to, withCount });
    if (opts.failOnPage !== undefined && calls.length === opts.failOnPage) {
      return { data: null, count: null, error: { message: 'boom' } };
    }
    const span = Math.min(to - from + 1, serverMaxRows);
    return { data: all.slice(from, from + span), count: withCount ? totalRows : null, error: null };
  };
  return { fetchPage, calls };
}

// 7888 is a FIXTURE, not live ground truth. It was the reviews row count on
// 2026-07-29 when the B2 truncation bug was found, which is why it was chosen;
// the real table is 5,954 rows since the 2026-07-31 dedup. Nothing here depends
// on the live figure — the arithmetic under test is "cap 5000, server clamp
// 1000, exact count from page 1" — so the number is deliberately left alone
// rather than chased, and this note exists so it is not mistaken for a total
// anyone should quote.
test('B2 regression: cap 5000 against 7888 rows fetches five clamped pages and reports the exact total', async () => {
  const { fetchPage, calls } = serverStub(7888);
  const r = await fetchAllWithCap(fetchPage, 5000);
  assert.equal(r.error, null);
  assert.equal(r.rows.length, 5000);
  assert.equal(r.exactCount, 7888); // NOT rows.length — this is the number Sera got wrong live
  assert.deepEqual(calls.map(c => [c.from, c.to]), [[0, 999], [1000, 1999], [2000, 2999], [3000, 3999], [4000, 4999]]);
  assert.deepEqual(calls.map(c => c.withCount), [true, false, false, false, false]);
});

test('naive single request against the same stub returns 1000 — the stub models the real clamp', async () => {
  const { fetchPage } = serverStub(7888);
  const page = await fetchPage(0, 4999, true);
  assert.equal(page.data!.length, 1000); // what .limit(5000) actually got live
  assert.equal(page.count, 7888);
});

test('result set smaller than one page: single request, complete result', async () => {
  const { fetchPage, calls } = serverStub(171);
  const r = await fetchAllWithCap(fetchPage, 4000);
  assert.equal(r.rows.length, 171);
  assert.equal(r.exactCount, 171);
  assert.equal(calls.length, 1);
});

test('result set exactly one page: stops via exact count, no extra empty-page request', async () => {
  const { fetchPage, calls } = serverStub(1000);
  const r = await fetchAllWithCap(fetchPage, 4000);
  assert.equal(r.rows.length, 1000);
  assert.equal(r.exactCount, 1000);
  assert.equal(calls.length, 1);
});

test('multi-page result under the cap is fetched completely', async () => {
  const { fetchPage, calls } = serverStub(2387);
  const r = await fetchAllWithCap(fetchPage, 5000);
  assert.equal(r.rows.length, 2387);
  assert.equal(r.exactCount, 2387);
  assert.equal(calls.length, 3);
});

test('cap below one page requests only the capped span', async () => {
  const { fetchPage, calls } = serverStub(7888);
  const r = await fetchAllWithCap(fetchPage, 300);
  assert.equal(r.rows.length, 300);
  assert.equal(r.exactCount, 7888);
  assert.deepEqual(calls.map(c => [c.from, c.to]), [[0, 299]]);
});

test('a failing later page fails the whole fetch (no silent partial totals)', async () => {
  const { fetchPage } = serverStub(7888, { failOnPage: 2 });
  const r = await fetchAllWithCap(fetchPage, 5000);
  assert.notEqual(r.error, null);
  assert.equal(r.rows.length, 0);
  assert.equal(r.exactCount, null);
});

test('rows are concatenated in server order across page boundaries', async () => {
  const { fetchPage } = serverStub(2500);
  const r = await fetchAllWithCap(fetchPage, 5000);
  assert.equal(r.rows[0].id, 2500);
  assert.equal(r.rows[999].id, 1501);
  assert.equal(r.rows[1000].id, 1500); // boundary: no duplicate, no gap
  assert.equal(r.rows[2499].id, 1);
});
