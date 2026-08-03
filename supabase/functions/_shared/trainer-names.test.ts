import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  collapseWhitespace,
  formatTrainerNames,
  normalizeTrainerNames,
  trainerNamesTooLong,
  MAX_TRAINER_COUNT,
  MAX_TRAINER_NAMES_LENGTH,
  TRAINER_NAMES_SEPARATOR,
} from './trainer-names.ts';

// Real values from this tenant, so the tests fail if its shapes are misremembered.
const AHMED = 'Ahmed Mokhtar Elsayed Elaktaa';
const AIMAN = 'Aiman Ibrahim Aly Radwan';
const MUHAMMED_DIRTY = 'Muhammed Muhammed  Zawahir'; // a live row: double space
const MUHAMMED_CLEAN = 'Muhammed Muhammed Zawahir';

test('the separator is a semicolon and exactly one space', () => {
  // Asserted as a value, not just used, because the PowerApp and a hand-typed backfill
  // must match it and nothing in this system reads the column back to notice.
  assert.equal(TRAINER_NAMES_SEPARATOR, '; ');
});

test('formatTrainerNames joins in selection order with no trailing separator', () => {
  assert.equal(formatTrainerNames([AHMED]), AHMED);
  assert.equal(formatTrainerNames([AHMED, AIMAN]), `${AHMED}; ${AIMAN}`);
  // Order is the order chosen — reversing the input must reverse the output.
  assert.equal(formatTrainerNames([AIMAN, AHMED]), `${AIMAN}; ${AHMED}`);
  assert.doesNotMatch(formatTrainerNames([AHMED, AIMAN]), /;\s*$/);
});

test('collapseWhitespace fixes the dirt Colleagues_Master actually holds', () => {
  assert.equal(collapseWhitespace(MUHAMMED_DIRTY), MUHAMMED_CLEAN);
  assert.equal(collapseWhitespace('  leading and trailing  '), 'leading and trailing');
  assert.equal(collapseWhitespace('tabs\tand\nnewlines'), 'tabs and newlines');
  assert.equal(collapseWhitespace('   '), '');
  // A single-spaced name is untouched — this must not "normalise" correct data.
  assert.equal(collapseWhitespace(AHMED), AHMED);
});

test('normalizeTrainerNames collapses, trims and preserves order', () => {
  assert.deepEqual(normalizeTrainerNames([` ${AHMED} `, MUHAMMED_DIRTY]), [
    AHMED,
    MUHAMMED_CLEAN,
  ]);
});

test('normalizeTrainerNames dedupes case-insensitively, keeping the first spelling', () => {
  assert.deepEqual(normalizeTrainerNames([AHMED, AHMED.toUpperCase()]), [AHMED]);
  // And after collapsing: "A  B" and "A B" are the same person.
  assert.deepEqual(normalizeTrainerNames([MUHAMMED_DIRTY, MUHAMMED_CLEAN]), [MUHAMMED_CLEAN]);
});

test('null means "no trainer names sent", so a legacy client falls through', () => {
  assert.equal(normalizeTrainerNames(undefined), null);
  assert.equal(normalizeTrainerNames(null), null);
  assert.equal(normalizeTrainerNames([]), null);
  assert.equal(normalizeTrainerNames(AHMED), null, 'a bare string is not the field');
  assert.equal(normalizeTrainerNames({ 0: AHMED }), null);
});

test('a malformed entry rejects the WHOLE field rather than dropping one trainer', () => {
  // Submitting two of the three trainers someone chose is a wrong record that nothing
  // surfaces; falling through to a 400 is recoverable.
  assert.equal(normalizeTrainerNames([AHMED, '']), null);
  assert.equal(normalizeTrainerNames([AHMED, '   ']), null);
  assert.equal(normalizeTrainerNames([AHMED, '\t\n']), null);
  assert.equal(normalizeTrainerNames([AHMED, null]), null);
  assert.equal(normalizeTrainerNames([AHMED, 42]), null);
  assert.equal(normalizeTrainerNames([AHMED, { colleagueName: AIMAN }]), null);
});

test('an absurd number of entries is refused before any string work', () => {
  const many = Array.from({ length: MAX_TRAINER_COUNT + 1 }, (_, i) => `Trainer ${i}`);
  assert.equal(normalizeTrainerNames(many), null);
  // Exactly at the cap is allowed.
  assert.equal(normalizeTrainerNames(many.slice(0, MAX_TRAINER_COUNT))?.length, MAX_TRAINER_COUNT);
});

test('trainerNamesTooLong refuses rather than letting SharePoint truncate', () => {
  assert.equal(trainerNamesTooLong([AHMED, AIMAN]), null);

  // Grown until it overflows rather than hardcoding a count: my first attempt asserted
  // that five 32-character names exceed 255, which is arithmetic nonsense (168), and
  // the test failed for the wrong reason. Deriving it cannot be wrong.
  const long: string[] = [];
  while (formatTrainerNames(long).length <= MAX_TRAINER_NAMES_LENGTH) {
    long.push(`Abdul Rahman Mohammed Al Farsi ${long.length}`);
  }
  assert.ok(long.length <= MAX_TRAINER_COUNT, 'this case must test length, not the count cap');

  const message = trainerNamesTooLong(long);
  assert.ok(message, `${long.length} long names must not fit in ${MAX_TRAINER_NAMES_LENGTH}`);
  // The message must name the limit and the count, or the user cannot act on it.
  assert.match(message, new RegExp(String(MAX_TRAINER_NAMES_LENGTH)));
  assert.match(message, new RegExp(`${long.length} trainer names`));

  // The boundary is inclusive: a value of exactly 255 fits.
  const exact = ['x'.repeat(MAX_TRAINER_NAMES_LENGTH)];
  assert.equal(formatTrainerNames(exact).length, MAX_TRAINER_NAMES_LENGTH);
  assert.equal(trainerNamesTooLong(exact), null);
  assert.ok(trainerNamesTooLong(['x'.repeat(MAX_TRAINER_NAMES_LENGTH + 1)]));
});

test('ANTI-VACUITY: the separator is what actually lands between names', () => {
  // If the join ever changes to a comma, the PowerApp and every backfilled row diverge
  // from what this app writes, and nothing downstream would ever notice.
  const value = formatTrainerNames([AHMED, AIMAN, MUHAMMED_CLEAN]);
  assert.equal(value.split(TRAINER_NAMES_SEPARATOR).length, 3);
  assert.deepEqual(value.split(TRAINER_NAMES_SEPARATOR), [AHMED, AIMAN, MUHAMMED_CLEAN]);
  assert.doesNotMatch(value, /,/);
});
