// Writing participant rows to SharePoint via Graph's $batch endpoint instead of
// one POST per row.
//
// WHY. sp-submit-training used to loop, awaiting one item-create per participant.
// At the old 15-participant cap that is 15 sequential calls; at 100 it is 100,
// which is precisely the pattern Microsoft's own guidance says to avoid, and
// names $batch as the remedy. Two consequences at 100, not one:
//   - SharePoint Online throttles list-write bursts. Each 429 costs a
//     Retry-After wait (graphFetch defaults to 10s), PER CALL.
//   - Edge functions have a 400s wall clock on this project's Pro plan. 100
//     nominal calls fit comfortably; 100 calls where forty of them get throttled
//     three times each do not, and blowing the ceiling returns a 504 with
//     SharePoint half-written.
// 20 requests per batch turns 100 rows into 5 calls.
//
// WHY IT LIVES IN ITS OWN FILE, not ../_shared/graph.ts: graph.ts reads
// Deno.env at module top level, so importing it from a `node --test` file throws
// ReferenceError before a single assertion runs. Nothing in here touches Deno or
// the network — the batch sender is injected — so it runs in the hermetic
// test:unit gate. See participant-batch.test.ts.

// Graph's hard limit. Sending more in one $batch is rejected outright.
export const GRAPH_BATCH_LIMIT = 20;

export interface BatchRequest {
  id: string;
  method: string;
  url: string;
  headers: Record<string, string>;
  body: unknown;
}

export interface BatchResponse {
  id: string;
  status: number;
  headers?: Record<string, string>;
  body?: unknown;
}

export type BatchSender = (requests: BatchRequest[]) => Promise<BatchResponse[]>;

export interface ParticipantItem {
  rowNo: number;
  fields: Record<string, unknown>;
}

export interface ParticipantFailure {
  rowNo: number;
  error: string;
}

// Mirrors the 429 handling in _shared/graph.ts, including the reason its guard
// exists: Retry-After may be delay-seconds OR an HTTP-date, and parseInt on an
// HTTP-date yields NaN. An unguarded NaN would make the sleep resolve
// immediately and turn this into a hot retry loop against a service that is
// already asking us to slow down.
function retryAfterMs(responses: BatchResponse[], attempt: number): number {
  let seconds = 0;
  for (const response of responses) {
    const raw = response.headers?.['Retry-After'] ?? response.headers?.['retry-after'];
    const parsed = parseInt(raw ?? '', 10);
    if (Number.isFinite(parsed) && parsed > seconds) seconds = parsed;
  }
  // No usable Retry-After: exponential backoff rather than hammering.
  if (seconds <= 0) return Math.min(2 ** attempt, 16) * 1000;
  return Math.min(seconds, 60) * 1000;
}

function describe(body: unknown): string {
  if (body == null) return '';
  if (typeof body === 'string') return body.slice(0, 500);
  try {
    return JSON.stringify(body).slice(0, 500);
  } catch {
    return String(body);
  }
}

/**
 * Creates one SharePoint list item per participant, in batches.
 *
 * Returns one entry per row that did NOT land — the same "report the failures,
 * keep the successes" contract the sequential loop had, because the caller
 * mirrors the landed rows to Supabase and records the rest for a human.
 *
 * A row is only ever reported once: it either lands, is retried, or is a
 * failure. It can never be both retried and failed.
 */
export async function writeParticipantsInBatches(
  items: ParticipantItem[],
  listUrl: string,
  send: BatchSender,
  opts: {
    batchSize?: number;
    maxAttempts?: number;
    sleep?: (ms: number) => Promise<void>;
  } = {},
): Promise<ParticipantFailure[]> {
  const batchSize = Math.max(1, Math.min(opts.batchSize ?? GRAPH_BATCH_LIMIT, GRAPH_BATCH_LIMIT));
  const maxAttempts = Math.max(1, opts.maxAttempts ?? 3);
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));

  const failures: ParticipantFailure[] = [];
  let pending = items;

  for (let attempt = 1; attempt <= maxAttempts && pending.length > 0; attempt++) {
    const retry: ParticipantItem[] = [];
    const throttled: BatchResponse[] = [];

    for (let offset = 0; offset < pending.length; offset += batchSize) {
      const chunk = pending.slice(offset, offset + batchSize);
      const requests: BatchRequest[] = chunk.map((item) => ({
        id: String(item.rowNo),
        method: 'POST',
        url: listUrl,
        headers: { 'Content-Type': 'application/json' },
        body: { fields: item.fields },
      }));

      let responses: BatchResponse[];
      try {
        responses = await send(requests);
      } catch (err) {
        // The $batch call itself failed — network, an unretryable 5xx, an
        // expired token. Every row in this chunk is unaccounted for and must be
        // reported as such; treating a transport failure as "no failures" would
        // report a complete session that is missing up to 20 people.
        const message = err instanceof Error ? err.message : String(err);
        for (const item of chunk) {
          failures.push({ rowNo: item.rowNo, error: `$batch request failed: ${message}` });
        }
        continue;
      }

      // Graph does NOT guarantee that responses come back in request order, so
      // they must be matched by id. Reading them positionally is the classic
      // $batch bug: it would attribute one row's error to a different person.
      const byId = new Map(responses.map((response) => [String(response.id), response]));

      for (const item of chunk) {
        const response = byId.get(String(item.rowNo));
        if (!response) {
          // A response can be absent entirely. Skipping it would silently drop
          // the row from both the landed set and the failure set, so the session
          // would look complete while a person is missing.
          failures.push({
            rowNo: item.rowNo,
            error: 'no response for this row in the $batch reply',
          });
          continue;
        }
        if (response.status >= 200 && response.status < 300) continue;
        if (response.status === 429 && attempt < maxAttempts) {
          retry.push(item);
          throttled.push(response);
          continue;
        }
        failures.push({
          rowNo: item.rowNo,
          error: `Graph API ${response.status}: ${describe(response.body)}`,
        });
      }
    }

    pending = retry;
    if (pending.length > 0) await sleep(retryAfterMs(throttled, attempt));
  }

  return failures;
}
