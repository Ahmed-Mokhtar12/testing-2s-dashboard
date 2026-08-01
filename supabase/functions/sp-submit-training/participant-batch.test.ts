import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  writeParticipantsInBatches,
  GRAPH_BATCH_LIMIT,
  type BatchRequest,
  type BatchResponse,
  type ParticipantItem,
} from './participant-batch.ts';

const LIST_URL = '/sites/site-1/lists/list-1/items';
const noSleep = async () => {};

function items(count: number): ParticipantItem[] {
  return Array.from({ length: count }, (_, index) => ({
    rowNo: index + 1,
    fields: { EmployeeID: `E${index + 1}` },
  }));
}

function ok(requests: BatchRequest[]): BatchResponse[] {
  return requests.map((request) => ({ id: request.id, status: 201 }));
}

test('100 rows go out as 5 batches of 20, never more than the Graph limit', async () => {
  const sizes: number[] = [];
  const failures = await writeParticipantsInBatches(items(100), LIST_URL, async (requests) => {
    sizes.push(requests.length);
    return ok(requests);
  }, { sleep: noSleep });

  assert.deepEqual(failures, []);
  assert.deepEqual(sizes, [20, 20, 20, 20, 20]);
  assert.ok(sizes.every((size) => size <= GRAPH_BATCH_LIMIT));
  // ANTI-VACUITY: a sender that is never called also produces zero failures.
  assert.equal(sizes.reduce((a, b) => a + b, 0), 100);
});

test('every row is sent exactly once, and requests carry the row number as the id', async () => {
  const seen: string[] = [];
  await writeParticipantsInBatches(items(45), LIST_URL, async (requests) => {
    for (const request of requests) {
      seen.push(request.id);
      assert.equal(request.method, 'POST');
      assert.equal(request.url, LIST_URL);
      assert.equal(request.headers['Content-Type'], 'application/json');
    }
    return ok(requests);
  }, { sleep: noSleep });

  assert.equal(seen.length, 45);
  assert.equal(new Set(seen).size, 45, 'a row was sent twice');
  assert.deepEqual(seen.slice().sort((a, b) => Number(a) - Number(b)).map(Number), items(45).map((i) => i.rowNo));
});

test('responses returned OUT OF ORDER are matched by id, not by position', async () => {
  // The failure this guards: reading responses positionally attributes one
  // person's error to a different person. Row 3 is the only failure; a
  // positional read would blame row 1.
  const failures = await writeParticipantsInBatches(items(3), LIST_URL, async (requests) => {
    const responses = requests.map((request) => ({
      id: request.id,
      status: request.id === '3' ? 400 : 201,
      body: request.id === '3' ? { error: { message: 'invalid field' } } : undefined,
    }));
    return responses.reverse();
  }, { sleep: noSleep });

  assert.equal(failures.length, 1);
  assert.equal(failures[0].rowNo, 3);
  assert.match(failures[0].error, /Graph API 400/);
  assert.match(failures[0].error, /invalid field/);
});

test('a 429 is retried and can then succeed, and is NOT reported as a failure', async () => {
  let call = 0;
  const sizes: number[] = [];
  const failures = await writeParticipantsInBatches(items(3), LIST_URL, async (requests) => {
    call++;
    sizes.push(requests.length);
    if (call === 1) {
      return requests.map((request) => ({
        id: request.id,
        status: request.id === '2' ? 429 : 201,
        headers: request.id === '2' ? { 'Retry-After': '1' } : undefined,
      }));
    }
    return ok(requests);
  }, { sleep: noSleep });

  assert.deepEqual(failures, []);
  assert.equal(call, 2, 'the throttled row should have been retried in a second batch');
  assert.deepEqual(sizes, [3, 1], 'only the throttled row is retried, not the whole chunk');
});

test('a 429 that never clears is reported as a failure once attempts run out', async () => {
  let call = 0;
  const failures = await writeParticipantsInBatches(items(2), LIST_URL, async (requests) => {
    call++;
    return requests.map((request) => ({ id: request.id, status: request.id === '1' ? 429 : 201 }));
  }, { sleep: noSleep, maxAttempts: 3 });

  assert.equal(call, 3);
  assert.equal(failures.length, 1, 'the row must be reported exactly once, not once per attempt');
  assert.equal(failures[0].rowNo, 1);
  assert.match(failures[0].error, /Graph API 429/);
});

test('a non-429 error is NOT retried', async () => {
  let call = 0;
  const failures = await writeParticipantsInBatches(items(1), LIST_URL, async (requests) => {
    call++;
    return requests.map((request) => ({ id: request.id, status: 403, body: 'forbidden' }));
  }, { sleep: noSleep });

  assert.equal(call, 1, 'a 403 will not become a 201 by asking again');
  assert.equal(failures.length, 1);
  assert.match(failures[0].error, /Graph API 403/);
});

test('a missing response is a failure, not a silently dropped row', async () => {
  // If this row vanished from both the landed set and the failure set, the
  // session would look complete while a person was missing from SharePoint.
  const failures = await writeParticipantsInBatches(items(3), LIST_URL, async (requests) =>
    requests.filter((request) => request.id !== '2').map((request) => ({ id: request.id, status: 201 })),
  { sleep: noSleep });

  assert.equal(failures.length, 1);
  assert.equal(failures[0].rowNo, 2);
  assert.match(failures[0].error, /no response/);
});

test('a thrown $batch call reports every row in that chunk, not zero', async () => {
  const failures = await writeParticipantsInBatches(items(25), LIST_URL, async (requests) => {
    if (requests.some((request) => request.id === '1')) throw new Error('Graph API 503: unavailable');
    return ok(requests);
  }, { sleep: noSleep });

  // First chunk of 20 threw; the remaining 5 landed.
  assert.equal(failures.length, 20);
  assert.deepEqual(failures.map((failure) => failure.rowNo), items(20).map((item) => item.rowNo));
  for (const failure of failures) assert.match(failure.error, /\$batch request failed: Graph API 503/);
});

test('no row is ever both retried and reported failed', async () => {
  const failures = await writeParticipantsInBatches(items(40), LIST_URL, async (requests) =>
    requests.map((request) => ({
      id: request.id,
      // Everything throttles forever; all 40 must end up as exactly 40 failures.
      status: 429,
    })),
  { sleep: noSleep, maxAttempts: 2 });

  assert.equal(failures.length, 40);
  assert.equal(new Set(failures.map((failure) => failure.rowNo)).size, 40);
});

test('an oversized batchSize is clamped to the Graph limit rather than trusted', async () => {
  const sizes: number[] = [];
  await writeParticipantsInBatches(items(30), LIST_URL, async (requests) => {
    sizes.push(requests.length);
    return ok(requests);
  }, { sleep: noSleep, batchSize: 500 });

  assert.deepEqual(sizes, [20, 10]);
});

test('an empty participant list sends nothing and reports nothing', async () => {
  let called = false;
  const failures = await writeParticipantsInBatches([], LIST_URL, async (requests) => {
    called = true;
    return ok(requests);
  }, { sleep: noSleep });

  assert.deepEqual(failures, []);
  assert.equal(called, false);
});
