import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  indexColleaguesByEmployeeId,
  mapColleagueTrainerRow,
  normalizeTrainerEmployeeIds,
  parseAccountLookupId,
  resolveTrainerIdsByEmployeeId,
  type ColleagueTrainerRow,
} from './colleague-trainers.ts';

// Real shapes from this tenant, so the tests fail if the tenant's shapes are
// misremembered: Amir's account address is stored mixed-case, and his colleague
// row's name differs from his account's display name.
function row(over: Partial<ColleagueTrainerRow> = {}): ColleagueTrainerRow {
  return {
    employeeId: '102387',
    colleagueName: 'Amir Gerges Daoud',
    isActive: true,
    accountLookupId: 1000,
    ...over,
  };
}

test('parseAccountLookupId accepts what Graph really returns and refuses the rest', () => {
  assert.equal(parseAccountLookupId(1000), 1000);
  // Graph frequently returns lookup ids as strings.
  assert.equal(parseAccountLookupId('1000'), 1000);
  assert.equal(parseAccountLookupId(' 1000 '), 1000);
  // Single-element array: tolerated in case the column is ever switched to
  // multi-select, so the feature degrades instead of failing for everyone.
  assert.equal(parseAccountLookupId([1000]), 1000);

  // Empty column: the property is absent, empty, or SharePoint's 0.
  assert.equal(parseAccountLookupId(undefined), null);
  assert.equal(parseAccountLookupId(null), null);
  assert.equal(parseAccountLookupId(''), null);
  assert.equal(parseAccountLookupId('   '), null);
  assert.equal(parseAccountLookupId(0), null);
  assert.equal(parseAccountLookupId('0'), null);
  // Never guess: a negative, a fraction, junk, or an ambiguous multi-value.
  assert.equal(parseAccountLookupId(-5), null);
  assert.equal(parseAccountLookupId(12.5), null);
  assert.equal(parseAccountLookupId('12abc'), null);
  assert.equal(parseAccountLookupId([1000, 1004]), null);
  assert.equal(parseAccountLookupId([]), null);
  assert.equal(parseAccountLookupId({ LookupId: 1000 }), null);
});

test('mapColleagueTrainerRow reads a row defensively, and drops one with no employee id', () => {
  assert.deepEqual(
    mapColleagueTrainerRow({
      EmployeeID: ' 102387 ',
      ColleagueName: ' Amir Gerges Daoud ',
      IsActive: 'Yes',
      ColleagueAccountLookupId: '1000',
    }),
    { employeeId: '102387', colleagueName: 'Amir Gerges Daoud', isActive: true, accountLookupId: 1000 },
  );

  // An unlinked colleague is a real row, not a broken one: it maps, and refuses later
  // with a reason the user can act on.
  assert.deepEqual(mapColleagueTrainerRow({ EmployeeID: '111111', ColleagueName: 'Jihn', IsActive: false }), {
    employeeId: '111111',
    colleagueName: 'Jihn',
    isActive: false,
    accountLookupId: null,
  });

  // EmployeeID is the only field a lookup cannot proceed without.
  assert.equal(mapColleagueTrainerRow({ ColleagueName: 'No ID' }), null);
  assert.equal(mapColleagueTrainerRow({ EmployeeID: '   ' }), null);
});

test('a re-hired colleague with two rows resolves via the active linked one, whatever the order', () => {
  const stale = row({ isActive: false, accountLookupId: null });
  const current = row({ accountLookupId: 1000 });

  for (const rows of [[stale, current], [current, stale]]) {
    const indexed = indexColleaguesByEmployeeId(rows);
    assert.equal(indexed.get('102387')?.accountLookupId, 1000, 'the usable row must win regardless of list order');
    assert.equal(indexed.size, 1);
  }
});

test('resolving maps ids and dedupes, without consulting a name or an address', () => {
  const rows = [
    row({ employeeId: '102387', colleagueName: 'Amir Gerges Daoud', accountLookupId: 1000 }),
    row({ employeeId: '100932', colleagueName: 'Ahmed Mokhtar Elsayed Elaktaa', accountLookupId: 932 }),
  ];

  const { ids, refusals } = resolveTrainerIdsByEmployeeId(rows, ['102387', '100932']);
  assert.deepEqual(ids, [1000, 932]);
  assert.deepEqual(refusals, []);

  // Two colleague rows pointing at one account: SharePoint rejects a Person
  // collection containing repeats.
  const shared = [
    row({ employeeId: 'A', accountLookupId: 1000 }),
    row({ employeeId: 'B', accountLookupId: 1000 }),
  ];
  assert.deepEqual(resolveTrainerIdsByEmployeeId(shared, ['A', 'B']).ids, [1000]);
});

test('every refusal names the person and the reason, and nothing is silently dropped', () => {
  const rows = [
    row({ employeeId: '102387', accountLookupId: 1000 }),
    row({ employeeId: '111111', colleagueName: 'Jihn', isActive: false, accountLookupId: null }),
    row({ employeeId: '200001', colleagueName: 'Fatima Ali', isActive: true, accountLookupId: null }),
  ];

  const { ids, refusals } = resolveTrainerIdsByEmployeeId(rows, [
    '102387',
    '111111',
    '200001',
    '999999',
  ]);

  // The one resolvable trainer still resolves — a bad selection must not discard
  // the good ones, because the caller returns 400 and shows every reason at once.
  assert.deepEqual(ids, [1000]);
  assert.equal(refusals.length, 3);
  assert.match(refusals[0], /Jihn \(111111\).*not an active colleague/);
  assert.match(refusals[1], /Fatima Ali \(200001\).*no linked account/);
  // A role mailbox with no colleague record at all — engadmin@ / Longtermcoordinator@
  // are the live examples.
  assert.match(refusals[2], /999999 is not in the colleague list/);
});

test('a row with no colleague name still refuses identifiably', () => {
  const { refusals } = resolveTrainerIdsByEmployeeId(
    [row({ employeeId: '300001', colleagueName: '', accountLookupId: null })],
    ['300001'],
  );
  assert.deepEqual(refusals, ['employee ID 300001 has no linked account in Colleagues_Master']);
});

test('normalizeTrainerEmployeeIds decides which resolution path a submission takes', () => {
  assert.deepEqual(normalizeTrainerEmployeeIds(['102387', ' 100932 ']), ['102387', '100932']);
  // A client that sends numbers is not a client that sends nothing.
  assert.deepEqual(normalizeTrainerEmployeeIds([102387]), ['102387']);
  assert.deepEqual(normalizeTrainerEmployeeIds(['102387', '102387']), ['102387'], 'deduped');

  // null means "fall through to the legacy email path".
  assert.equal(normalizeTrainerEmployeeIds(undefined), null);
  assert.equal(normalizeTrainerEmployeeIds([]), null);
  assert.equal(normalizeTrainerEmployeeIds('102387'), null, 'a bare string is not the field');

  // A malformed entry rejects the WHOLE field rather than dropping one trainer:
  // submitting two of the three trainers the user picked is a wrong record that
  // nothing surfaces, and falling through to a 400 is recoverable.
  assert.equal(normalizeTrainerEmployeeIds(['102387', '']), null);
  assert.equal(normalizeTrainerEmployeeIds(['102387', '   ']), null);
  assert.equal(normalizeTrainerEmployeeIds(['102387', null]), null);
  assert.equal(normalizeTrainerEmployeeIds(['102387', { employeeId: '1' }]), null);
});

test('ANTI-VACUITY: an unlinked or inactive colleague can never yield an id', () => {
  // The one property the whole design rests on. If this ever passes with an id, the
  // picker has become able to offer someone the submit cannot record — the trap this
  // replaced.
  for (const bad of [
    row({ accountLookupId: null }),
    row({ isActive: false }),
    row({ isActive: false, accountLookupId: null }),
  ]) {
    const { ids, refusals } = resolveTrainerIdsByEmployeeId([bad], [bad.employeeId]);
    assert.deepEqual(ids, [], 'no id may be produced');
    assert.equal(refusals.length, 1, 'and the reason must be reported');
  }
});
