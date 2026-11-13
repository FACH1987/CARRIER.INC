import test from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, verifyPassword } from '../lib/passwords.ts';

test('passwords use unique salts and reject incorrect or malformed hashes', async () => {
  const password = 'test-only password with spaces';
  const first = await hashPassword(password);
  const second = await hashPassword(password);
  assert.notEqual(first, second);
  assert(!first.includes(password));
  assert(await verifyPassword(password, first));
  assert.equal(await verifyPassword('wrong password', first), false);
  assert.equal(await verifyPassword(password), false);
  assert.equal(await verifyPassword(password, 'malformed'), false);
});
