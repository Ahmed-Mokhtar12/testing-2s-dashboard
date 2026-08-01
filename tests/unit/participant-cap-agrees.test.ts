import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// The participant cap is enforced in TWO runtimes and therefore declared twice:
//
//   src/lib/hotel-training-constants.ts        MAX_PARTICIPANTS  (the form)
//   supabase/functions/sp-submit-training/     MAX_PARTICIPANTS  (the submit)
//
// They cannot share a module. The edge tree is Deno, both tsconfigs exclude it,
// and importing across the boundary would break the git archive the deploy
// scripts build. So the drift is made detectable rather than pretended away.
//
// What this prevents is specific and was named as the thing not to ship: a form
// that accepts 100 participants while the edge function rejects anything over
// 15. The wizard would fill, the confirmation step would render, and submission
// would fail at the last click with 99 rows of work already done — worse than
// never having raised the cap.
//
// It also catches the reverse: raising the edge cap and forgetting the form,
// which silently keeps the old limit with no error anywhere.
const FRONTEND_SRC = 'src/lib/hotel-training-constants.ts';
const EDGE_SRC = 'supabase/functions/sp-submit-training/index.ts';

function capFrom(path: string): number {
  const source = readFileSync(path, 'utf8');
  const match = source.match(/^(?:export )?const MAX_PARTICIPANTS = (\d+);/m);
  assert.ok(match, `could not find "const MAX_PARTICIPANTS = <n>;" in ${path}`);
  return Number(match[1]);
}

test('the form cap and the edge-function cap are the same number', () => {
  const frontend = capFrom(FRONTEND_SRC);
  const edge = capFrom(EDGE_SRC);

  // ANTI-VACUITY. Both extractions returning NaN would make them "equal" under
  // a loose comparison and 0 === 0 would pass a naive check outright, which is
  // exactly what a broken regex or a renamed constant produces. Assert both are
  // real, usable numbers before comparing them.
  assert.ok(Number.isInteger(frontend) && frontend > 0, `${FRONTEND_SRC} cap is not a positive integer: ${frontend}`);
  assert.ok(Number.isInteger(edge) && edge > 0, `${EDGE_SRC} cap is not a positive integer: ${edge}`);

  assert.equal(
    frontend,
    edge,
    `participant cap mismatch: ${FRONTEND_SRC} allows ${frontend} but ${EDGE_SRC} allows ${edge}. `
      + 'A wizard the user can fill and cannot submit is worse than no change — move both.',
  );
});

test('no user-facing cap message hard-codes the number instead of deriving it', () => {
  // A validator that allows 100 while its message says "Maximum 15" is the same
  // drift wearing different clothes, and it is the half a reader believes.
  const offenders: string[] = [];
  for (const path of [FRONTEND_SRC, EDGE_SRC, 'src/components/hotel-training/TrainingDetailsForm.tsx']) {
    const source = readFileSync(path, 'utf8');
    for (const line of source.split('\n')) {
      // Comments are allowed to name historical values ("Raised 15 -> 100").
      const code = line.replace(/\/\/.*$/, '');
      if (/(?:Maximum|between 1 and)\s+\d+/.test(code)) offenders.push(`${path}: ${line.trim()}`);
    }
  }
  assert.deepEqual(
    offenders,
    [],
    'these cap messages state a literal number; interpolate MAX_PARTICIPANTS instead',
  );
});
