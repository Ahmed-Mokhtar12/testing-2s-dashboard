import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  collapseColleagueFields,
  collapseWhitespace,
} from '../../src/lib/text.ts';
import {
  collapseColleagueFields as edgeCollapseColleagueFields,
  collapseWhitespace as edgeCollapseWhitespace,
} from '../../supabase/functions/_shared/text.ts';

// A colleague row is normalised in TWO runtimes and therefore declared twice:
//
//   src/lib/text.ts                        the Manage Members forms
//   supabase/functions/_shared/text.ts     sp-manage-colleague, which is authoritative
//
// They cannot share a module — the edge tree is Deno, both tsconfigs exclude it, and an
// import across the boundary would break the git archive the deploy scripts build. Same
// constraint and same remedy as participant-cap-agrees.test.ts.
//
// WHAT THIS GUARDS. Until 2026-08-04 sp-manage-colleague validated a field with `.trim()`
// and then wrote the RAW value one line later, so the Manage Members tab was itself a
// source of whitespace dirt in Colleagues_Master — six of 336 rows, five names and two
// positions. Downstream: the monthly report dedupes trainer names with
// raw.trim().toLowerCase() and so counts "A  B" and "A B" as two people, and Sera searches
// participants with `.includes(needle)` and so cannot find a stored double space from a
// needle typed with one. Five colleagues were unfindable.
//
// If the client collapsed and the server did not, the confirmation dialog would state one
// value and the list would store another. If the server collapsed and the client did not,
// EditMemberForm would offer whitespace-only "changes" that changed nothing. Both halves
// have to agree, which is what this file asserts.

// The real dirt, from the measurement. Kept as data rather than prose so the cases cannot
// drift away from what the list actually held.
const REAL_ROWS = [
  { dirty: 'Kazi Belayet  Hossai kazi Abdul Awal', clean: 'Kazi Belayet Hossai kazi Abdul Awal' },
  { dirty: 'Walid  Abd El Monem Mahmoud', clean: 'Walid Abd El Monem Mahmoud' },
  { dirty: 'Muhammed Muhammed  Zawahir', clean: 'Muhammed Muhammed Zawahir' },
  { dirty: 'Abdelfattah Abdelwahed  Ghallab', clean: 'Abdelfattah Abdelwahed Ghallab' },
  { dirty: 'Nuwan  Buddhika kuma Bandara Arachchilage', clean: 'Nuwan Buddhika kuma Bandara Arachchilage' },
  { dirty: ' IT Manager', clean: 'IT Manager' },
  { dirty: 'Executive Secretary  /PA', clean: 'Executive Secretary /PA' },
];

test('both runtimes clean every row that was actually dirty in Colleagues_Master', () => {
  for (const { dirty, clean } of REAL_ROWS) {
    assert.equal(collapseWhitespace(dirty), clean, `client: ${JSON.stringify(dirty)}`);
    assert.equal(edgeCollapseWhitespace(dirty), clean, `edge: ${JSON.stringify(dirty)}`);
  }
});

test('ANTI-VACUITY: every fixture really is dirty', () => {
  // A table of already-clean strings would satisfy the test above against two functions
  // that did nothing at all.
  for (const { dirty, clean } of REAL_ROWS) {
    assert.notEqual(dirty, clean, `${JSON.stringify(dirty)} is not actually dirty`);
  }
});

test('ALL FOUR fields are collapsed, not just the name', () => {
  // Two of the six dirty rows were POSITIONS. Collapsing only the field whose symptom had
  // been noticed would have left the same defect in three others.
  const input = {
    employeeId: '101710',
    colleagueName: 'Muhammed Muhammed  Zawahir',
    position: ' IT Manager',
    section: 'Information  Technology',
    department: '  Information Technology  ',
  };
  const expected = {
    employeeId: '101710',
    colleagueName: 'Muhammed Muhammed Zawahir',
    position: 'IT Manager',
    section: 'Information Technology',
    department: 'Information Technology',
  };

  assert.deepEqual(collapseColleagueFields(input), expected);
  assert.deepEqual(edgeCollapseColleagueFields(input), expected);
});

test('the two implementations agree field by field, not just in aggregate', () => {
  for (const { dirty } of REAL_ROWS) {
    const input = {
      colleagueName: dirty,
      position: dirty,
      section: dirty,
      department: dirty,
    };
    assert.deepEqual(
      collapseColleagueFields(input),
      edgeCollapseColleagueFields(input),
      `implementations disagree on ${JSON.stringify(dirty)}`,
    );
  }
});

test('fields that are not the four text fields pass through untouched', () => {
  // employeeId is numeric and IsActive is a boolean; normalising either would be a
  // different kind of bug. The generic signature must not quietly reshape the object.
  const input = {
    employeeId: ' 101710 ',
    colleagueName: 'A  B',
    position: 'P',
    section: 'S',
    department: 'D',
    reactivate: true,
  };
  const out = collapseColleagueFields(input);

  assert.equal(out.employeeId, ' 101710 ', 'employeeId must NOT be collapsed here');
  assert.equal(out.reactivate, true);
  assert.equal(out.colleagueName, 'A B');
  assert.deepEqual(Object.keys(out).sort(), Object.keys(input).sort());
});

test('it does not mutate its input', () => {
  const input = { colleagueName: 'A  B', position: 'P', section: 'S', department: 'D' };
  const snapshot = structuredClone(input);
  collapseColleagueFields(input);
  assert.deepEqual(input, snapshot);
});

test('an already-clean row is returned unchanged by both', () => {
  const input = {
    colleagueName: 'Jagmohan Singh',
    position: 'Attendant',
    section: 'Housekeeping',
    department: 'Housekeeping',
  };
  assert.deepEqual(collapseColleagueFields(input), input);
  assert.deepEqual(edgeCollapseColleagueFields(input), input);
});
