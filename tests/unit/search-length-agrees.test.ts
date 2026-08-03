import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// MIN_SEARCH_LENGTH gates the wider-directory search in TWO runtimes and is therefore
// declared twice:
//
//   src/lib/trainer-search.ts                 the UI decides when to OFFER the search
//   supabase/functions/_shared/directory.ts   the function decides when to REFUSE it
//
// They cannot share a module. The edge tree is Deno, both tsconfigs exclude it, and
// importing across the boundary would break the git archive the deploy scripts build.
// So the drift is made detectable rather than pretended away — the same treatment
// MAX_PARTICIPANTS gets in participant-cap-agrees.test.ts, and for the same reason.
//
// The failure this prevents is small and infuriating: the picker offers "Search the
// full Microsoft directory" at 2 characters while the function rejects anything under
// 3. The user clicks the thing the form just invited them to click and gets an error.
// Nothing in typecheck, lint or the e2e suite would catch it, because each side is
// internally consistent.
const FRONTEND_SRC = 'src/lib/trainer-search.ts';
const EDGE_SRC = 'supabase/functions/_shared/directory.ts';

function minLengthFrom(path: string): number {
  const source = readFileSync(path, 'utf8');
  const match = source.match(/^(?:export )?const MIN_SEARCH_LENGTH = (\d+);/m);
  assert.ok(match, `could not find "const MIN_SEARCH_LENGTH = <n>;" in ${path}`);
  return Number(match[1]);
}

test('the two MIN_SEARCH_LENGTH declarations agree', () => {
  const frontend = minLengthFrom(FRONTEND_SRC);
  const edge = minLengthFrom(EDGE_SRC);

  assert.equal(
    frontend,
    edge,
    `${FRONTEND_SRC} offers the directory search at ${frontend} characters but ${EDGE_SRC} refuses under ${edge}. ` +
      'Change both, or the UI invites a click that errors.',
  );
});

test('the shared value is at least 2', () => {
  // ANTI-VACUITY: two files both saying 0 or 1 would satisfy the agreement test while
  // making the search useless — a 1-character tokenised directory search returns a
  // slab of the tenant.
  assert.ok(minLengthFrom(FRONTEND_SRC) >= 2, 'a 1-character directory search is meaningless');
});
