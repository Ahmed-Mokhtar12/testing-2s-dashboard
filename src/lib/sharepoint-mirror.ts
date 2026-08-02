// The freshness rule for public.sharepoint_mirror, the Postgres copy of the three
// SharePoint read results. Kept free of value imports so `node --test` can load it
// directly (tests/unit/mirror-freshness.test.ts) — the same reason
// tests/hotel-training.spec.ts imports hotel-training-constants by relative path.
//
// The client decides freshness, not the server: the mirror stores when a payload
// was fetched and nothing else, so changing a TTL is a frontend deploy rather than
// a migration.

export type MirrorKey = 'colleagues' | 'trainers' | 'columns';

// How long a mirrored payload is served before the client goes back to the edge
// function. These are chosen from how each dataset actually changes, not from a
// round number:
//
// - colleagues: adds, edits and deactivations happen through the Manage Members
//   tab, and sp-manage-colleague DELETES the mirror row on every successful
//   write — so this TTL only bounds how long a change made DIRECTLY in SharePoint
//   stays invisible. 15 minutes is short enough that "I added them in SharePoint
//   and the form doesn't show them" resolves itself before anyone reports it.
// - trainers: the site's User Information List only gains a row when someone
//   visits the SharePoint site for the first time. sp-read-trainers already
//   caches this for 15 minutes in memory.
// - columns: only changes when the SharePoint list schema does, which is a
//   deliberate act by an admin.
//
// A longer TTL is not free in either direction: too long hides real changes, too
// short puts users back on the 3.5 s cold-start path
// (docs/perf/hotel-training-baseline.md).
export const MIRROR_TTL_MS: Record<MirrorKey, number> = {
  colleagues: 15 * 60 * 1000,
  trainers: 60 * 60 * 1000,
  columns: 60 * 60 * 1000,
};

// Fails closed: anything it cannot reason about is NOT fresh, so the caller falls
// back to invoking the edge function and the worst case is today's behaviour.
//
// A future fetched_at is rejected rather than treated as maximally fresh. The
// column is stamped by the database, so a timestamp ahead of the browser means
// the two clocks disagree — and trusting it would extend the TTL by the skew,
// silently, for as long as the skew lasted.
export function isMirrorFresh(fetchedAt: string | null | undefined, key: MirrorKey, now = Date.now()): boolean {
  if (!fetchedAt) return false;

  const at = Date.parse(fetchedAt);
  if (!Number.isFinite(at)) return false;

  const age = now - at;
  if (age < 0) return false;

  return age < MIRROR_TTL_MS[key];
}
