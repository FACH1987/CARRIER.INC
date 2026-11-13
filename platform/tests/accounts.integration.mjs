import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { Miniflare } from 'miniflare';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

// In-memory Worker + D1 only: this suite cannot contact a production server.
const base = 'https://rutacarga.test';
let runtime;
const suffix = randomUUID();
const email = `test-${suffix}@example.com`;
const password = `  ${randomBytes(24).toString('base64url')}  `;
const ip = `192.0.2.${Math.floor(Math.random() * 250) + 1}`;
const cookieFrom = response => response.headers.get('set-cookie')?.split(';')[0];
const tokenHash = cookie => createHash('sha256').update(cookie.slice(cookie.indexOf('=') + 1)).digest('hex');
async function api(route, { method = 'GET', body, cookie, headers = {} } = {}) {
  const response = await runtime.dispatchFetch(base + route, { method, headers: { Origin: base, 'CF-Connecting-IP': ip, ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}), ...headers }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
  const text = await response.text();
  let data;
  try { data = JSON.parse(text); } catch { throw new Error(`Non-JSON response (${response.status}): ${text.slice(0, 250)}`); }
  return { status: response.status, headers: response.headers, json: async () => data };
}
test('local registration, session, cargo ownership, logout and access protection', { timeout: 45000 }, async t => {
  runtime = new Miniflare({
    modules: [
      { type: 'ESModule', path: path.resolve('dist/server/index.js') },
      ...readdirSync('dist/server', { recursive: true }).filter(name => name.endsWith('.js') && name !== 'index.js')
        .map(name => ({ type: 'ESModule', path: path.resolve('dist/server', name) }))
    ],
    modulesRoot: path.resolve('dist/server'),
    compatibilityDate: '2026-05-15', compatibilityFlags: ['nodejs_compat'],
    d1Databases: ['DB'], d1Persist: false
  });
  t.after(async () => { await runtime.dispose(); });
  const db = await runtime.getD1Database('DB');
  for (const file of ['drizzle/0000_cooing_guardian.sql', 'drizzle/0001_parched_hellcat.sql']) {
    const statements = readFileSync(file, 'utf8').split('--> statement-breakpoint').map(s => s.trim()).filter(Boolean);
    await db.batch(statements.map(statement => db.prepare(statement)));
  }
  let cookie;
  {
    await t.test('rejects short passwords and cross-origin registration', async () => {
      assert.equal((await api('/api/auth/register', { method: 'POST', body: { name: 'Test', email, password: 'short' } })).status, 400);
      assert.equal((await api('/api/auth/register', { method: 'POST', body: { name: 'Test', email, password }, headers: { Origin: 'https://other.example' } })).status, 403);
    });
    await t.test('creates a local account and an HttpOnly session without leaking credentials', async () => {
      const response = await api('/api/auth/register', { method: 'POST', body: { name: 'Local account test', email: email.toUpperCase(), password } });
      assert.equal(response.status, 201);
      cookie = cookieFrom(response);
      assert(cookie);
      assert.match(response.headers.get('set-cookie'), /HttpOnly/);
      assert.match(response.headers.get('set-cookie'), /Secure/);
      assert.match(cookie, /^__Host-rutacarga_session=/);
      assert.match(response.headers.get('set-cookie'), /SameSite=Lax/);
      assert.match(response.headers.get('set-cookie'), /Path=\//);
      const result = await response.json();
      assert.equal(result.user.email, email);
      assert(!JSON.stringify(result).includes(password));
      assert(!('passwordHash' in result.user));
      const stored = await db.prepare('select password_hash from users where email = ?').bind(email).first();
      assert.match(stored.password_hash, /^scrypt-v1\$/);
      assert.notEqual(stored.password_hash, password);
      assert(await db.prepare('select token_hash from sessions where token_hash = ?').bind(tokenHash(cookie)).first());
    });
    await t.test('normalizes email and rejects duplicates and incorrect credentials', async () => {
      assert.equal((await api('/api/auth/register', { method: 'POST', body: { name: 'Duplicate', email, password } })).status, 409);
      const bad = await api('/api/auth/login', { method: 'POST', body: { email, password: 'incorrect' } });
      const missing = await api('/api/auth/login', { method: 'POST', body: { email: `missing-${suffix}@example.com`, password } });
      assert.equal(bad.status, 401);
      assert.equal(missing.status, 401);
      assert.deepEqual(await bad.json(), await missing.json());
    });
    await t.test('recognizes only local sessions and ignores forged platform identity', async () => {
      assert.equal((await (await api('/api/auth/session', { cookie })).json()).user.email, email);
      assert.equal((await (await api('/api/auth/session')).json()).user, null);
      assert.equal((await api('/api/loads', { method: 'POST', body: {}, headers: { 'oai-authenticated-user-id': 'fake', 'oai-authenticated-user-email': email } })).status, 401);
      assert.equal((await (await api('/api/auth/session', { cookie: '__Host-rutacarga_session=' + randomBytes(32).toString('base64url') })).json()).user, null);
    });
    await t.test('rotates sessions on login and rejects the previous session', async () => {
      const previous = cookie;
      const response = await api('/api/auth/login', { method: 'POST', body: { email, password }, cookie });
      assert.equal(response.status, 200);
      cookie = cookieFrom(response);
      assert.notEqual(cookie, previous);
      assert.equal((await (await api('/api/auth/session', { cookie: previous })).json()).user, null);
    });
    await t.test('publishes from a local account and shares cargo with anonymous readers', async () => {
      const cargo = { origin: 'Managua', destination: 'León', pickupDate: '2099-12-01', equipment: 'Refrigerado', weight: 1200, pay: 5000, company: 'Local integration test', email };
      const response = await api('/api/loads', { method: 'POST', body: cargo, cookie });
      assert.equal(response.status, 201);
      const { load } = await response.json();
      const stored = await db.prepare('select owner_id from loads where id = ?').bind(load.id).first();
      const account = await db.prepare('select id from users where email = ?').bind(email).first();
      assert.equal(stored.owner_id, `account:${account.id}`);
      const listing = await (await api('/api/loads')).json();
      assert(listing.loads.some(row => row.id === load.id));
      assert.equal(listing.user, null);
      assert(!('ownerId' in listing.loads.find(row => row.id === load.id)));
      assert.equal((await api('/api/loads', { method: 'POST', cookie, body: cargo, headers: { Origin: 'https://other.example' } })).status, 403);
    });
    await t.test('expires sessions and invalidates them on logout', async () => {
      await db.prepare('update sessions set expires_at = 0 where token_hash = ?').bind(tokenHash(cookie)).run();
      assert.equal((await (await api('/api/auth/session', { cookie })).json()).user, null);
      const loggedIn = await api('/api/auth/login', { method: 'POST', body: { email, password } });
      assert.equal(loggedIn.status, 200);
      cookie = cookieFrom(loggedIn);
      assert.equal((await api('/api/auth/logout', { method: 'POST', cookie, body: {}, headers: { Origin: 'https://other.example' } })).status, 403);
      const response = await api('/api/auth/logout', { method: 'POST', cookie, body: {} });
      assert.equal(response.status, 200);
      assert.match(response.headers.get('set-cookie'), /Max-Age=0/);
      assert.equal((await (await api('/api/auth/session', { cookie })).json()).user, null);
      assert.equal((await api('/api/loads', { method: 'POST', cookie, body: {} })).status, 401);
    });
    await t.test('limits repeated password attempts', async () => {
      const target = `limit-${suffix}@example.com`;
      for (let i = 0; i < 10; i++) assert.equal((await api('/api/auth/login', { method: 'POST', body: { email: target, password } })).status, 401);
      assert.equal((await api('/api/auth/login', { method: 'POST', body: { email: target, password } })).status, 429);
    });
    await t.test('rejects oversized auth bodies', async () => {
      assert.equal((await api('/api/auth/login', { method: 'POST', body: { email, password: 'x'.repeat(5000) } })).status, 413);
    });
  }
});
