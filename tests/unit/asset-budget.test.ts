import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';

// Every file in src/assets is imported by a component, so it ships in the bundle
// or as a hashed asset and is downloaded by real users.
//
// Two logos here were 227 KB and 248 KB. Both are drawn into boxes no larger than
// 56 CSS px (h-14 w-14 on Auth and AuthCallback; 36 px in the sidebar, 28-40 px
// in the chat panel), and both were stored at ~815x700 — around 200x more pixels
// than any of those needs. On a warm reload of /auth, the 227 KB logo alone was
// 99% of everything that crossed the network, because it was also the one asset
// with no freshness basis to revalidate against
// (docs/perf/hotel-training-baseline.md). Downscaling both to 256 px on the long
// edge cut them to ~30 KB and ~26 KB with no visible change at any render size.
//
// This budget exists because that regression is a drag-and-drop away: replacing a
// logo with the original from a designer restores a 200 KB payload, and nothing
// in the build warns. Vite reports chunk sizes, not asset sizes.
const ASSETS_DIR = 'src/assets';

// Generous against the current largest (~30 KB) so ordinary re-exports pass, and
// far below the ~227 KB that prompted this. Raising it is a decision: check
// whether the asset is oversized for its render box first.
const BUDGET_BYTES = 48 * 1024;

test('no asset in src/assets exceeds its byte budget', () => {
  const files = readdirSync(ASSETS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name);

  // ANTI-VACUITY: an empty or mis-typed directory would pass every assertion
  // below without checking anything.
  assert.ok(files.length > 0, `${ASSETS_DIR} has no files; this test would prove nothing`);

  const oversized = files
    .map((name) => ({ name, bytes: statSync(path.join(ASSETS_DIR, name)).size }))
    .filter((file) => file.bytes > BUDGET_BYTES);

  assert.deepEqual(
    oversized,
    [],
    `over the ${(BUDGET_BYTES / 1024).toFixed(0)} KB budget: ${oversized
      .map((file) => `${file.name} at ${(file.bytes / 1024).toFixed(1)} KB`)
      .join(', ')}`,
  );
});
