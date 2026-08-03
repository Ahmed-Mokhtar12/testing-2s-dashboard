import { test } from 'node:test';
import assert from 'node:assert/strict';
import { collapseWhitespace, toTrainerNames } from '../../src/lib/trainer-names.ts';
import {
  collapseWhitespace as edgeCollapseWhitespace,
  normalizeTrainerNames,
} from '../../supabase/functions/_shared/trainer-names.ts';

// The TrainerNames format rule is implemented TWICE and has to be:
//
//   src/lib/trainer-names.ts                       the client, which writes
//                                                  training_sessions.trainer_names
//   supabase/functions/_shared/trainer-names.ts    the edge function, which writes
//                                                  the SharePoint TrainerNames column
//
// They cannot share a module — the edge tree is Deno, both tsconfigs exclude it, and an
// import across the boundary would break the git archive the deploy scripts build. Same
// constraint, same remedy, as tests/unit/participant-cap-agrees.test.ts.
//
// WHAT DIVERGENCE WOULD COST, and why no other test would catch it. One request feeds
// both writes. If only one side collapsed whitespace, the live row
// "Muhammed Muhammed  Zawahir" (a real double space) would be stored as two different
// strings in two stores — and NOTHING in this system reads TrainerNames back, so no
// code path would ever compare them. Worse, migration 20260803190000 normalised the
// existing Postgres rows to the COLLAPSED spelling, so an uncollapsed client would
// write names that no longer match the history and every report spanning the cutover
// would count that person twice. That is the defect commit 2 existed to prevent.

// One table, run through both implementations. Each row states what it is for, so a
// future edit cannot quietly delete the only case that exercised a rule.
const CASES: Array<{ what: string; input: string[]; expected: string[] }> = [
  { what: 'one clean name', input: ['Tariq Rashed'], expected: ['Tariq Rashed'] },
  {
    what: 'order is the selection order, not alphabetical',
    input: ['Xarmaigne Narciso', 'Aiman Ibrahim Aly Radwan'],
    expected: ['Xarmaigne Narciso', 'Aiman Ibrahim Aly Radwan'],
  },
  {
    what: 'a real double space collapses',
    input: ['Muhammed Muhammed  Zawahir'],
    expected: ['Muhammed Muhammed Zawahir'],
  },
  {
    what: 'leading and trailing whitespace is trimmed',
    input: ['  Ayman Khalil Darwish Erikat '],
    expected: ['Ayman Khalil Darwish Erikat'],
  },
  {
    what: 'tabs and newlines are whitespace too',
    input: ['Ahmed\tMokhtar\nElsayed   Elaktaa'],
    expected: ['Ahmed Mokhtar Elsayed Elaktaa'],
  },
  {
    what: 'case-insensitive dedupe keeps the first spelling',
    input: ['Amir Gerges Daoud', 'amir gerges daoud'],
    expected: ['Amir Gerges Daoud'],
  },
  {
    what: 'dedupe happens AFTER collapsing, so dirt cannot smuggle a duplicate through',
    input: ['Ayham Mooner Hammodi', 'Ayham  Mooner Hammodi'],
    expected: ['Ayham Mooner Hammodi'],
  },
];

test('the client and the edge function produce the same names for every case', () => {
  for (const { what, input, expected } of CASES) {
    const client = toTrainerNames(input.map((colleagueName) => ({ colleagueName })));
    const edge = normalizeTrainerNames(input);

    assert.deepEqual(client, expected, `client, ${what}`);
    assert.deepEqual(edge, expected, `edge, ${what}`);
    assert.deepEqual(client, edge, `MISMATCH on ${what}`);
  }
});

test('ANTI-VACUITY: the table really exercises collapsing and deduping', () => {
  // Every assertion above would still pass over a table of already-clean, distinct
  // names — and so would two implementations that did nothing at all.
  const collapsed = CASES.filter(({ input, expected }) =>
    input.some((name, index) => name !== expected[index]));
  assert.ok(collapsed.length > 0, 'no case where collapsing changes the value');

  const deduped = CASES.filter(({ input, expected }) => expected.length < input.length);
  assert.ok(deduped.length > 0, 'no case where dedupe removes an entry');
});

test('the two collapseWhitespace implementations are the same function', () => {
  // Checked directly as well as through the callers: the callers could agree while
  // differing on an input no case above reaches.
  for (const dirty of [
    'Muhammed Muhammed  Zawahir',
    ' IT Manager',
    'a b',
    '\t x \n',
    '',
    '   ',
    'already clean',
  ]) {
    assert.equal(
      collapseWhitespace(dirty),
      edgeCollapseWhitespace(dirty),
      `collapseWhitespace disagrees on ${JSON.stringify(dirty)}`,
    );
  }
});

test('the ONE deliberate divergence, asserted so it cannot change silently', () => {
  // A name that collapses to nothing: the edge function rejects the WHOLE field (null →
  // fall through to the legacy paths → a 400 the caller can act on), while the client
  // skips the entry.
  //
  // That is not an oversight. The edge function is the gate against a hand-built body
  // and must fail closed. The client runs over objects that already passed the form's
  // zod schema, where `colleagueName` has min length 1 — so the case is unreachable from
  // the UI, and failing a submission over it could only ever hurt a legitimate user.
  assert.equal(normalizeTrainerNames(['Tariq Rashed', '   ']), null);
  assert.deepEqual(
    toTrainerNames([{ colleagueName: 'Tariq Rashed' }, { colleagueName: '   ' }]),
    ['Tariq Rashed'],
  );

  // And the edge function's other fail-closed cases, which the client has no analogue
  // for at all: it is handed objects, not arbitrary JSON.
  assert.equal(normalizeTrainerNames([]), null);
  assert.equal(normalizeTrainerNames('Tariq Rashed'), null);
  assert.equal(normalizeTrainerNames([{ colleagueName: 'Tariq Rashed' }]), null);
});
