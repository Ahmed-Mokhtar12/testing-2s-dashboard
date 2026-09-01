import { test } from 'node:test';
import assert from 'node:assert/strict';
import { roleFromAuthorization } from '../../supabase/functions/_shared/jwt-role.ts';

const b64url = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = (payload: unknown) => `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url(payload)}.sig`;

test('reads the role claim from a bearer JWT', () => {
  assert.equal(roleFromAuthorization(`Bearer ${jwt({ role: 'service_role', iss: 'supabase' })}`), 'service_role');
  assert.equal(roleFromAuthorization(`bearer ${jwt({ role: 'anon' })}`), 'anon');
});

test('returns null for anything that is not a three-part JWT with a string role', () => {
  assert.equal(roleFromAuthorization(null), null);
  assert.equal(roleFromAuthorization(''), null);
  assert.equal(roleFromAuthorization('Bearer not.a.jwt.at.all'), null);
  assert.equal(roleFromAuthorization(`Bearer ${jwt({ role: 42 })}`), null);
  assert.equal(roleFromAuthorization('Bearer a.!!!.c'), null);
});
