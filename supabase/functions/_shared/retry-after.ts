// Pure, import-free (unit-tested under node --test) so graph.ts stays Deno-only.
export const MAX_RETRY_AFTER_SECONDS = 30;

// Retry-After can be delay-seconds or an HTTP-date; parseInt on an HTTP-date yields NaN,
// which would otherwise produce an immediate hot-retry loop against Graph. Graph has answered
// with values in the hundreds of seconds; three uncapped sleeps exceed the edge runtime's
// 400 s wall clock and leave a half-written submission behind (audit E9-M4), so the wait is
// capped — a request that cannot proceed within the cap fails loudly instead of hanging.
export function retryAfterSeconds(header: string | null): number {
  const parsed = parseInt(header ?? '10', 10);
  const seconds = Number.isFinite(parsed) && parsed > 0 ? parsed : 10;
  return Math.min(seconds, MAX_RETRY_AFTER_SECONDS);
}
