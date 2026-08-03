import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filterColleagues } from '../../src/lib/colleague-search.ts';
import type { Colleague } from '../../src/types/hotel-training.ts';

// The one availability-and-search rule both colleague pickers use. "Same search
// behaviour" between the trainer and participant fields is a stated requirement, so a
// divergence here is a defect the requirement names — not a style inconsistency.

function c(over: Partial<Colleague> = {}): Colleague {
  return {
    id: 'col-1',
    employeeId: '1001',
    colleagueName: 'Alice Smith',
    position: 'Supervisor',
    section: 'Reception Hotel',
    department: 'Front Office',
    isActive: true,
    ...over,
  };
}

const ALICE = c();
const BOB = c({ id: 'col-2', employeeId: '1002', colleagueName: 'Bob Jones' });
const DAVE = c({ id: 'col-4', employeeId: '1004', colleagueName: 'Dave Black', isActive: false });
const ALL = [ALICE, BOB, DAVE];

const names = (list: Colleague[]) => list.map((x) => x.colleagueName);

test('an inactive colleague is never offered, whatever else matches', () => {
  assert.deepEqual(names(filterColleagues(ALL, '')), ['Alice Smith', 'Bob Jones']);
  // Even searched for by exact name or exact id.
  assert.deepEqual(filterColleagues(ALL, 'Dave Black'), []);
  assert.deepEqual(filterColleagues(ALL, '1004'), []);
});

test('search matches the name case-insensitively, on any substring', () => {
  assert.deepEqual(names(filterColleagues(ALL, 'alice')), ['Alice Smith']);
  assert.deepEqual(names(filterColleagues(ALL, 'ALICE')), ['Alice Smith']);
  assert.deepEqual(names(filterColleagues(ALL, 'mith')), ['Alice Smith']);
  assert.deepEqual(names(filterColleagues(ALL, 'o')), ['Bob Jones']);
  assert.deepEqual(filterColleagues(ALL, 'zzz'), []);
});

test('search matches the employee id, and does so case-insensitively', () => {
  assert.deepEqual(names(filterColleagues(ALL, '1002')), ['Bob Jones']);
  assert.deepEqual(names(filterColleagues(ALL, '100')), ['Alice Smith', 'Bob Jones']);

  // Ids are numeric today so case cannot bite, but the rule must not depend on that:
  // the inline version this replaced compared a raw id against a raw query.
  const alphanumeric = c({ employeeId: 'HR-9001x', colleagueName: 'Tariq Rashed' });
  assert.deepEqual(names(filterColleagues([alphanumeric], 'hr-9001X')), ['Tariq Rashed']);
});

test('a blank or whitespace-only query returns every active colleague', () => {
  assert.deepEqual(names(filterColleagues(ALL, '')), ['Alice Smith', 'Bob Jones']);
  assert.deepEqual(names(filterColleagues(ALL, '   ')), ['Alice Smith', 'Bob Jones']);
});

test('exclude removes an employee id that is already taken', () => {
  assert.deepEqual(
    names(filterColleagues(ALL, '', { exclude: new Set(['1001']) })),
    ['Bob Jones'],
  );
});

test('keep beats exclude, so a control always shows its own current selection', () => {
  // The property that stops a filled row appearing empty in its own dropdown.
  assert.deepEqual(
    names(filterColleagues(ALL, '', { exclude: new Set(['1001', '1002']), keep: new Set(['1001']) })),
    ['Alice Smith'],
  );
});

test('keep does NOT resurrect an inactive colleague', () => {
  // isActive is absolute — `keep` is about availability, not about liveness.
  const result = names(filterColleagues(ALL, '', { keep: new Set(['1004']) }));
  assert.ok(!result.includes('Dave Black'), 'keep must not override isActive');
  // And the active ones are unaffected, so the assertion above is not passing merely
  // because the filter returned nothing at all.
  assert.deepEqual(result, ['Alice Smith', 'Bob Jones']);
});

test('ANTI-VACUITY: exclusion and search compose rather than one shadowing the other', () => {
  // A query that matches BOTH, with one excluded, must return exactly the other —
  // if either condition were dropped this returns two results or none.
  assert.deepEqual(
    names(filterColleagues(ALL, '100', { exclude: new Set(['1001']) })),
    ['Bob Jones'],
  );
  assert.equal(filterColleagues(ALL, '100').length, 2, 'the query alone must match both');
});
