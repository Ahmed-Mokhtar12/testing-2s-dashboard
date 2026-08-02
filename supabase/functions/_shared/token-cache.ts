// A Graph client-credentials token is valid for ~1 h and is identical for every
// caller: one app, one scope, no user. Every sp-* function nevertheless fetched a
// new one on every request — a full login.microsoftonline.com round trip before
// the first Graph call, paid three times over on a single Hotel Training page
// load. See docs/perf/hotel-training-baseline.md.
//
// WHY IT LIVES IN ITS OWN FILE, not in graph.ts: graph.ts reads Deno.env at
// module top level, so importing it from a `node --test` file throws
// ReferenceError before a single assertion runs. Nothing in here touches Deno,
// the network, or the clock — `now` is injected — so it runs in the hermetic
// test:unit gate. Same reasoning as sp-submit-training/participant-batch.ts.

// Renew this far before the token actually expires. A token that dies in flight
// costs a 401 on a user-visible request; five minutes of unused lifetime costs
// nothing. Azure AD issues these with expires_in around 3600.
export const TOKEN_SAFETY_MARGIN_MS = 5 * 60 * 1000;

export class TokenCache {
  private entry: { value: string; expiresAt: number } | null = null;

  // Returns null when there is nothing usable, so the caller's control flow stays
  // "fetch when null" — the same shape it had before any cache existed.
  get(now: number): string | null {
    if (!this.entry) return null;
    if (now >= this.entry.expiresAt) return null;
    return this.entry.value;
  }

  // `expiresIn` is Azure's `expires_in` in SECONDS, straight out of a JSON body,
  // so it is not to be trusted. A missing, non-numeric or non-positive value must
  // never yield a token that outlives its own validity: every rejected case
  // stores nothing, which degrades to exactly the pre-cache behaviour of fetching
  // a fresh token per request.
  set(value: string, expiresIn: unknown, now: number): void {
    const seconds = typeof expiresIn === 'number' ? expiresIn : Number(expiresIn);
    if (!Number.isFinite(seconds) || seconds <= 0) {
      this.entry = null;
      return;
    }

    // A token whose entire lifetime is shorter than the safety margin is not
    // worth caching. Storing it would give expiresAt <= now, which get() already
    // refuses — so this is the same outcome stated once, where it can be read.
    const usableMs = seconds * 1000 - TOKEN_SAFETY_MARGIN_MS;
    if (usableMs <= 0) {
      this.entry = null;
      return;
    }

    this.entry = { value, expiresAt: now + usableMs };
  }

  // Called when Graph rejects the token with 401. Without this, a rotated client
  // secret would keep being served from every warm isolate for the rest of the
  // cached lifetime. With no cache at all a rotation is picked up on the very
  // next request, and that must stay true.
  clear(): void {
    this.entry = null;
  }
}
