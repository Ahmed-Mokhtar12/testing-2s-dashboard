import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reconcileDraft } from '../../src/lib/hotel-training-draft.ts';

// Reading a saved localStorage draft back into the wizard, now that trainers are
// colleagues. Every drop class is asserted separately, because they all LOOK the same
// from outside — an empty trainer field — and only the notice tells the user which
// happened and what to do.

const TARIQ = {
  id: 'col-trainer',
  employeeId: '9001',
  colleagueName: 'Tariq Rashed',
  position: 'Training Manager',
  section: 'Human Resources',
  department: 'Human Resources',
  isActive: true,
};

const ALICE = {
  id: 'col-1',
  employeeId: '1001',
  colleagueName: 'Alice Smith',
  position: 'Supervisor',
  section: 'Reception Hotel',
  department: 'Front Office',
  isActive: true,
};

const draftWith = (trainingDetails: unknown, participants: unknown = []) => ({
  trainingDetails,
  participants,
  step: 1,
  savedAt: '2026-08-03T10:00:00.000Z',
});

test('a draft already in the new shape is kept verbatim, with no notice', () => {
  const result = reconcileDraft(draftWith({ title: 'Fire Safety', trainers: [TARIQ] }));

  assert.deepEqual(result.details?.trainers, [TARIQ]);
  assert.equal(result.details?.title, 'Fire Safety');
  assert.deepEqual(result.notices, []);
});

test('it does not mutate the draft it was given', () => {
  // The caller holds the parsed object; reconcileDraft deletes retired keys and clears
  // conflicting rows, and doing that in place would corrupt the value the page still
  // has a reference to.
  const draft = draftWith(
    { trainers: [{ displayName: 'Ahmed Mokhtar', email: 'a@b.com' }], trainerNames: ['Amir Monir'] },
    [{ rowNo: 1, colleague: TARIQ }],
  );
  const snapshot = structuredClone(draft);

  reconcileDraft(draft);

  assert.deepEqual(draft, snapshot, 'the input draft was modified in place');
});

test('a legacy displayName/email trainer is dropped and named in the notice', () => {
  const result = reconcileDraft(draftWith({
    trainers: [{ displayName: 'Ahmed Mokhtar', email: 'ahmed.mokhtar@2seasonshotels.com' }],
  }));

  assert.deepEqual(result.details?.trainers, []);
  assert.equal(result.notices.length, 1);
  assert.match(result.notices[0], /"Ahmed Mokhtar"/);
  assert.match(result.notices[0], /select them again/i);
});

test('a bare name string is dropped and named', () => {
  const result = reconcileDraft(draftWith({ trainers: ['Amir Gerges Daoud'] }));

  assert.deepEqual(result.details?.trainers, []);
  assert.match(result.notices[0], /"Amir Gerges Daoud"/);
});

test('an unreadable entry is dropped and counted rather than named', () => {
  const result = reconcileDraft(draftWith({ trainers: [42, null, { nothing: 'useful' }] }));

  assert.deepEqual(result.details?.trainers, []);
  assert.equal(result.notices.length, 1);
  assert.match(result.notices[0], /3 unreadable entries/);
});

test('a named drop and an unreadable one are reported together, not one or the other', () => {
  const result = reconcileDraft(draftWith({ trainers: [{ displayName: 'Ahmed Mokhtar' }, 42] }));

  assert.equal(result.notices.length, 1);
  assert.match(result.notices[0], /"Ahmed Mokhtar"/);
  assert.match(result.notices[0], /1 unreadable entry/);
  assert.match(result.notices[0], /2 trainers/, 'the count must cover both');
});

test('a partially-shaped colleague is dropped, not accepted', () => {
  // The reason the zod schema and this check both name every field: an object with
  // employeeId and colleagueName only would satisfy the wire and then render a
  // Confirmation row with three blank badges.
  const result = reconcileDraft(draftWith({
    trainers: [{ employeeId: '9001', colleagueName: 'Tariq Rashed' }],
  }));

  assert.deepEqual(result.details?.trainers, []);
  assert.match(result.notices[0], /"Tariq Rashed"/);
});

test('a colleague with an empty employeeId or name is dropped', () => {
  const blankId = reconcileDraft(draftWith({ trainers: [{ ...TARIQ, employeeId: '  ' }] }));
  assert.deepEqual(blankId.details?.trainers, []);

  const blankName = reconcileDraft(draftWith({ trainers: [{ ...TARIQ, colleagueName: '' }] }));
  assert.deepEqual(blankName.details?.trainers, []);
});

test('the retired structural trainer key is removed, and its names are reported', () => {
  const result = reconcileDraft(draftWith({ title: 'Old Draft', trainerNames: ['Ahmed Mokhtar'] }));

  assert.equal(result.details?.title, 'Old Draft');
  assert.ok(
    !Object.keys(result.details!).some((key) => key !== 'trainers' && key.startsWith('trainer')),
    'the retired key survived',
  );
  assert.deepEqual(result.details?.trainers, []);
  assert.match(result.notices[0], /"Ahmed Mokhtar"/);
});

test('a trainer-prefixed key that is NOT an array survives untouched', () => {
  // The old version keyed on "array of strings" and this keys on "array"; either way a
  // future scalar field whose name happens to start with `trainer` must not be eaten.
  const result = reconcileDraft(draftWith({ trainers: [TARIQ], trainerNotes: 'covered evacuation' }));

  assert.equal((result.details as Record<string, unknown>).trainerNotes, 'covered evacuation');
  assert.deepEqual(result.notices, []);
});

test('the same colleague listed twice as a trainer is collapsed to one', () => {
  const result = reconcileDraft(draftWith({ trainers: [TARIQ, { ...TARIQ, id: 'other-row' }] }));

  assert.deepEqual(result.details?.trainers, [TARIQ]);
});

test('OVERLAP: the trainer wins and the participant row is CLEARED, naming the row', () => {
  const result = reconcileDraft(draftWith(
    { trainers: [TARIQ] },
    [{ rowNo: 1, colleague: ALICE }, { rowNo: 2, colleague: TARIQ }],
  ));

  // The trainer survives. This is the assertion the "clear the trainer instead" mutation
  // has to break: zod requires at least one trainer, so clearing it would block Next
  // with nothing on screen to explain why.
  assert.deepEqual(result.details?.trainers, [TARIQ]);

  assert.equal(result.participants.length, 2, 'rows must be cleared, never spliced');
  assert.deepEqual(result.participants[0].colleague, ALICE, 'an unrelated row is untouched');
  assert.equal(result.participants[1].colleague, null);
  assert.deepEqual(result.participants.map((row) => row.rowNo), [1, 2]);

  const overlap = result.notices.find((notice) => /cannot be a trainer and a participant/.test(notice));
  assert.ok(overlap, `no overlap notice in ${JSON.stringify(result.notices)}`);
  assert.match(overlap, /row 2/);
  assert.match(overlap, /Tariq Rashed/);
});

test('overlap is matched on employeeId, not on the object or the name', () => {
  // A draft's participant copy and trainer copy of one person can differ in any other
  // field — they were read from the list at different moments. Only the id is identity.
  const result = reconcileDraft(draftWith(
    { trainers: [TARIQ] },
    [{ rowNo: 1, colleague: { ...TARIQ, id: 'stale', position: 'Trainer', colleagueName: 'Tariq Rashed' } }],
  ));

  assert.equal(result.participants[0].colleague, null);
});

test('no overlap notice when the trainer is not also a participant', () => {
  // ANTI-VACUITY for the two tests above: if the overlap branch fired unconditionally
  // they would both still pass.
  const result = reconcileDraft(draftWith({ trainers: [TARIQ] }, [{ rowNo: 1, colleague: ALICE }]));

  assert.deepEqual(result.participants[0].colleague, ALICE);
  assert.deepEqual(result.notices, []);
});

test('a malformed participant row becomes an empty row rather than vanishing', () => {
  const result = reconcileDraft(draftWith({ trainers: [TARIQ] }, [
    { rowNo: 1, colleague: { displayName: 'Not a colleague' } },
    'garbage',
    { colleague: ALICE },
  ]));

  assert.equal(result.participants.length, 3);
  assert.equal(result.participants[0].colleague, null);
  assert.equal(result.participants[1].colleague, null);
  // rowNo falls back to the index when the stored one is unusable, so the wizard's
  // keys stay unique and the rows stay in order.
  assert.deepEqual(result.participants.map((row) => row.rowNo), [1, 2, 3]);
  assert.deepEqual(result.participants[2].colleague, ALICE);
});

test('a draft with no training details still reconciles its participants', () => {
  const result = reconcileDraft(draftWith(null, [{ rowNo: 1, colleague: ALICE }]));

  assert.equal(result.details, null);
  assert.deepEqual(result.participants, [{ rowNo: 1, colleague: ALICE }]);
  assert.deepEqual(result.notices, []);
});

test('anything unparseable yields an empty reconciliation instead of throwing', () => {
  // restoreDraft's catch shows a toast; reaching it means the user loses the draft with
  // no explanation of what was wrong, so this fails soft on every shape.
  for (const raw of [null, undefined, 42, 'a string', [], {}]) {
    const result = reconcileDraft(raw);
    assert.deepEqual(result.participants, [], `${JSON.stringify(raw)} produced rows`);
    assert.deepEqual(result.notices, []);
  }
});
