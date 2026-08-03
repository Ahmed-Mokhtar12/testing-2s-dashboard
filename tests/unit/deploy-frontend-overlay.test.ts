import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

// scripts/deploy-frontend.sh carries assets from the previous build forward, so a
// page that was already open when a deploy lands can still fetch the lazy chunks
// it refers to. Nothing else in this repo can test that: running the script IS a
// deploy, and the failure is invisible from the server — the deploy reports OK and
// a user's panel dies the next time they open a route they had not visited.
//
// scripts/rehearse-deploy-frontend.sh runs the real script against a sandbox with
// npm, pm2 and curl shimmed, and refuses to run unless it has verifiably replaced
// the constants that point at the live site. It also mutates the script and asserts
// each of the deploy's own checks can fail — an assertion that cannot fail is the
// exact shape of every green-but-broken gate in docs/testing-lessons.md.
const REHEARSE = 'scripts/rehearse-deploy-frontend.sh';

function rehearse(mutation: string): string {
  try {
    return execFileSync('bash', [REHEARSE, mutation], { encoding: 'utf8', timeout: 120_000 });
  } catch (error) {
    const shell = error as { stdout?: string; stderr?: string };
    assert.fail(
      `rehearsal '${mutation}' failed:\n${shell.stdout ?? ''}\n${shell.stderr ?? ''}`,
    );
  }
}

test('a deploy carries the previous build forward, prunes only what is stale, and proves it', () => {
  const out = rehearse('none');
  assert.match(out, /REHEARSAL PASS \(clean\)/);
  // Named individually so a failure says which property broke, not just "the
  // rehearsal failed". The rehearsal prints one `ok:` line per property.
  for (const property of [
    'index.html replaced by this build',
    "every asset this build produced is live",
    "previous build's index-OLD.js and Recent-OLD.js carried over",
    'Ancient-OLD.js pruned at 30 days',
    'kept and refreshed despite a 30-day mtime',
    'asserted a retained asset is actually served',
    'no dist-staging left behind',
  ]) {
    assert.ok(out.includes(property), `the rehearsal did not report: ${property}`);
  }
});

// Each of these breaks one thing the deploy script claims to check. If any stops
// failing, that check has become decorative.
for (const mutation of ['no-overlay', 'prune-deletes-everything', 'probe-file-unserved']) {
  test(`the deploy refuses to report success when '${mutation}'`, () => {
    assert.match(rehearse(mutation), new RegExp(`REHEARSAL PASS \\(${mutation}\\)`));
  });
}

// Deliberately expected to change nothing — see the rehearsal's header. Asserted so
// that the day it becomes load-bearing is the day this test tells us.
test("the prune's in-this-build guard is redundant, and safe while redundant", () => {
  assert.match(rehearse('prune-ignores-current'), /inert by design/);
});
