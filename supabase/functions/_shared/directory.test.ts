import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildUserSearchClause,
  directoryEmail,
  isLikelyStaff,
  markInSite,
  membershipClaim,
  mergeTrainerSources,
  toTrainerEntries,
  DIRECTORY_SELECT,
  MIN_SEARCH_LENGTH,
  type DirectoryUser,
  type TrainerEntry,
} from './directory.ts';

// What these guard, in one line: who appears in the trainer picker, and whether the
// picker tells the truth about who can actually be recorded. Getting the second one
// wrong is the failure this whole design exists to avoid — a user filling a
// 100-participant form for a trainer SharePoint will refuse at the last click.

const staff = (over: Partial<DirectoryUser> = {}): DirectoryUser => ({
  displayName: 'Real Person',
  mail: 'real.person@2seasonshotels.com',
  accountEnabled: true,
  jobTitle: 'Chef de Partie',
  department: 'Kitchen',
  ...over,
});

test('the staff heuristic keeps anyone with a job title OR a department', () => {
  assert.equal(isLikelyStaff(staff()), true);
  assert.equal(isLikelyStaff(staff({ department: null })), true, 'job title alone is enough');
  assert.equal(isLikelyStaff(staff({ jobTitle: null })), true, 'department alone is enough');

  // The service/shared mailboxes this exists to hide: no job data at all.
  assert.equal(isLikelyStaff(staff({ jobTitle: null, department: null })), false);
  assert.equal(isLikelyStaff(staff({ jobTitle: '', department: '   ' })), false, 'whitespace is not data');
});

test('an identity falls back to userPrincipalName when mail is unset', () => {
  // The UIL indexes the login, and sp-submit-training matches on exactly these two
  // fields — so dropping a mail-less account here would hide someone recordable.
  assert.equal(directoryEmail(staff()), 'real.person@2seasonshotels.com');
  assert.equal(
    directoryEmail(staff({ mail: null, userPrincipalName: 'UPN.Only@2seasonshotels.com' })),
    'upn.only@2seasonshotels.com',
    'lowercased, because the UIL is indexed lowercased',
  );
  assert.equal(directoryEmail(staff({ mail: null, userPrincipalName: null })), null);
  assert.equal(directoryEmail(staff({ mail: 'not-an-email' })), null);
});

test('unusable directory rows are dropped, and staffOnly is honoured', () => {
  const users: DirectoryUser[] = [
    staff({ displayName: 'Kept Person' }),
    staff({ displayName: 'Disabled Person', mail: 'disabled@x.com', accountEnabled: false }),
    staff({ displayName: '', mail: 'nameless@x.com' }),
    staff({ displayName: 'No Mailbox', mail: null, userPrincipalName: null }),
    staff({ displayName: 'Night Auditor', mail: 'auditor@x.com', jobTitle: null, department: null }),
  ];

  const filtered = toTrainerEntries(users, { staffOnly: true });
  assert.deepEqual(filtered.map((e) => e.displayName), ['Kept Person']);

  // The wider search reaches past the heuristic on purpose — that is the hatch.
  const wide = toTrainerEntries(users, { staffOnly: false });
  assert.deepEqual(wide.map((e) => e.displayName), ['Kept Person', 'Night Auditor']);
  // ...but never past the rows that could not be recorded or displayed at all.
  assert.equal(wide.some((e) => e.displayName === 'Disabled Person'), false);
  assert.equal(wide.some((e) => e.displayName === 'No Mailbox'), false);
});

test('inSite defaults to false, so "not recordable" is the answer when nobody set it', () => {
  // Fail closed: a caller that forgets to consult the UIL must not imply that a
  // directory-only person can be recorded.
  for (const entry of toTrainerEntries([staff()], { staffOnly: false })) {
    assert.equal(entry.inSite, false);
  }
});

test('markInSite flags exactly the emails present in the site, case-insensitively', () => {
  const entries = toTrainerEntries(
    [staff({ displayName: 'In Site', mail: 'in.site@x.com' }), staff({ displayName: 'Outside', mail: 'outside@x.com' })],
    { staffOnly: false },
  );

  const marked = markInSite(entries, ['IN.SITE@X.COM', '  ', '']);
  assert.equal(marked.find((e) => e.displayName === 'In Site')?.inSite, true);
  assert.equal(marked.find((e) => e.displayName === 'Outside')?.inSite, false);
});

test('the union restores a site member the heuristic would have dropped', () => {
  // THE POINT OF THE UNION, and the operator's first sub-case. Someone in the site
  // with a blank directory record must appear in the ORDINARY list — no wider
  // search needed — because they are submittable today.
  const directory = toTrainerEntries([staff({ displayName: 'Has Job Data' })], { staffOnly: true });
  const site: TrainerEntry[] = [
    { displayName: 'Blank Record', email: 'blank.record@x.com', inSite: true },
  ];

  const merged = mergeTrainerSources(directory, site);
  assert.deepEqual(merged.map((e) => e.displayName), ['Blank Record', 'Has Job Data']);
  assert.equal(merged.find((e) => e.email === 'blank.record@x.com')?.inSite, true);
});

test('a person in both sources appears once, and the site wins the inSite fact', () => {
  const directory = toTrainerEntries(
    [staff({ displayName: 'Both Sides', mail: 'both@x.com', jobTitle: 'Steward' })],
    { staffOnly: true },
  );
  const site: TrainerEntry[] = [{ displayName: 'Both Sides', email: 'both@x.com', inSite: true }];

  const merged = mergeTrainerSources(directory, site);
  assert.equal(merged.length, 1, 'deduped by email');
  assert.equal(merged[0].inSite, true, 'the UIL carries the fact that decides recordability');
  // The job title survives only to disambiguate two people with the same name; the
  // UIL never supplies one, so losing it here would be a silent downgrade.
  assert.equal(merged[0].jobTitle, 'Steward');
});

test('the merged list is sorted by display name', () => {
  const directory = toTrainerEntries(
    [staff({ displayName: 'Zoe Last', mail: 'z@x.com' }), staff({ displayName: 'Aaron First', mail: 'a@x.com' })],
    { staffOnly: true },
  );
  assert.deepEqual(
    mergeTrainerSources(directory, []).map((e) => e.displayName),
    ['Aaron First', 'Zoe Last'],
  );
});

test('the $search clause matches the shape Microsoft documents', () => {
  // Asserted against the literal example on
  // learn.microsoft.com/en-us/graph/search-query-parameter:
  //     ../users?$search="displayName:Guthr" OR "mail:Guthr"
  assert.equal(buildUserSearchClause('Guthr'), '"displayName:Guthr" OR "mail:Guthr"');
  assert.equal(buildUserSearchClause('  moh  '), '"displayName:moh" OR "mail:moh"', 'trimmed');
});

test('quote and backslash are escaped in the search clause', () => {
  // Per the documented clause syntax: the clause is wrapped in double quotes, and a
  // `"` or `\` inside it must be backslash-escaped. Unescaped, a quote would end the
  // clause early and Graph would reject the query — or worse, reinterpret it.
  assert.equal(buildUserSearchClause('a"b'), '"displayName:a\\"b" OR "mail:a\\"b"');
  assert.equal(buildUserSearchClause('a\\b'), '"displayName:a\\\\b" OR "mail:a\\\\b"');
  // Backslash is escaped BEFORE the quote, or the quote's own escape gets escaped.
  assert.equal(buildUserSearchClause('a\\"b'), '"displayName:a\\\\\\"b" OR "mail:a\\\\\\"b"');
});

test('a query shorter than the minimum is refused, not sent', () => {
  assert.ok(MIN_SEARCH_LENGTH >= 2, 'a 1-character directory search is meaningless');
  assert.throws(() => buildUserSearchClause('m'), /at least/);
  assert.throws(() => buildUserSearchClause('   '), /at least/);
  assert.throws(() => buildUserSearchClause(''), /at least/);
});

test('the ensureuser claims login is the documented Entra member form', () => {
  assert.equal(
    membershipClaim('Ibrahim.Mohammad@2seasonshotels.com'),
    'i:0#.f|membership|ibrahim.mohammad@2seasonshotels.com',
  );
  assert.throws(() => membershipClaim('nonsense'), /email-shaped/);
  assert.throws(() => membershipClaim(''), /email-shaped/);
});

test('both callers ask Graph for the same fields', () => {
  // The staff filter reads jobTitle and department; the identity reads mail and
  // userPrincipalName; the display reads displayName; the drop rule reads
  // accountEnabled. A $select missing any of them makes the filter silently wrong
  // rather than failing — everyone would look like a service account.
  for (const field of [
    'displayName',
    'mail',
    'userPrincipalName',
    'accountEnabled',
    'jobTitle',
    'department',
  ]) {
    assert.ok(DIRECTORY_SELECT.split(',').includes(field), `$select is missing ${field}`);
  }
});
