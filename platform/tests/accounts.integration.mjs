import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { Miniflare } from 'miniflare';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

// In-memory Worker + D1 only: this suite cannot contact a production server.
const base = 'https://rutacarga.test';
let runtime;
const adminId = '00000000-0000-4000-8000-000000000001';
const setupToken = 'test-only-setup-token';
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
    d1Databases: ['DB'], d1Persist: false,
    bindings: { ADMIN_ACCOUNT_ID: adminId, ADMIN_SETUP_TOKEN: setupToken, ADMIN_SETUP_EMAIL: email }
  });
  t.after(async () => { await runtime.dispose(); });
  const db = await runtime.getD1Database('DB');
  for (const file of JSON.parse(readFileSync('drizzle/meta/_journal.json', 'utf8')).entries.map(entry => 'drizzle/' + entry.tag + '.sql')) {
    const statements = readFileSync(file, 'utf8').split('--> statement-breakpoint').map(s => s.trim()).filter(Boolean);
    await db.batch(statements.map(statement => db.prepare(statement)));
  }
  let cookie;
  let publishedId;
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
      assert.equal(result.user.role, 'empresa');
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
    await t.test('publishes cargo and requires an account to read it', async () => {
      const cargo = { origin: 'Managua', destination: 'León', pickupDate: '2099-12-01', equipment: 'Refrigerado', weight: 1200, pay: 5000, company: 'Local integration test', email };
      const response = await api('/api/loads', { method: 'POST', body: cargo, cookie });
      assert.equal(response.status, 201);
      const { load } = await response.json();
      publishedId = load.id;
      assert.equal(load.canDelete, true);
      const stored = await db.prepare('select owner_id from loads where id = ?').bind(load.id).first();
      const account = await db.prepare('select id from users where email = ?').bind(email).first();
      assert.equal(stored.owner_id, `account:${account.id}`);
      const guest = await api('/api/loads');
      assert.equal(guest.status, 401);
      assert(!('loads' in await guest.json()));
      const listing = await (await api('/api/loads', { cookie })).json();
      assert(listing.loads.some(row => row.id === load.id));
      assert.equal(listing.user.email, email);
      assert(!('ownerId' in listing.loads.find(row => row.id === load.id)));
      assert.equal(listing.loads.find(row => row.id === load.id).canDelete, true);
      assert.equal((await api('/api/loads', { method: 'POST', cookie, body: cargo, headers: { Origin: 'https://other.example' } })).status, 403);
    });
    await t.test('only the owner can delete cargo, including expired own cargo', async () => {
      assert.equal((await api('/api/loads?mine=1')).status, 401);
      const mine = await (await api('/api/loads?mine=1', { cookie })).json();
      assert.equal(mine.loads.find(row => row.id === publishedId).canDelete, true);
      assert(mine.loads.every(row => !('ownerId' in row)));
      const otherEmail = `other-${suffix}@example.com`;
      const other = await api('/api/auth/register', { method: 'POST', body: { name: 'Other local account', email: otherEmail, password } });
      assert.equal(other.status, 201);
      const otherCookie = cookieFrom(other);
      const otherListing = await (await api('/api/loads', { cookie: otherCookie })).json();
      assert.equal(otherListing.loads.find(row => row.id === publishedId).canDelete, false);
      const otherMine = await (await api('/api/loads?mine=1', { cookie: otherCookie })).json();
      assert(!otherMine.loads.some(row => row.id === publishedId));
      const endpoint = '/api/loads/' + publishedId;
      assert.equal((await api(endpoint, { method: 'DELETE' })).status, 401);
      assert.equal((await api(endpoint, { method: 'DELETE', cookie: otherCookie })).status, 404);
      assert.equal((await api(endpoint, { method: 'DELETE', cookie, headers: { Origin: 'https://other.example' } })).status, 403);
      assert(await db.prepare('select id from loads where id = ?').bind(publishedId).first());
      const deleted = await api(endpoint, { method: 'DELETE', cookie });
      assert.equal(deleted.status, 200);
      assert.equal((await deleted.json()).deleted, true);
      assert.equal(await db.prepare('select id from loads where id = ?').bind(publishedId).first(), null);
      assert.equal((await api(endpoint, { method: 'DELETE', cookie })).status, 404);
      assert(!(await (await api('/api/loads', { cookie })).json()).loads.some(row => row.id === publishedId));
      const oldId = randomUUID();
      const owner = await db.prepare('select id from users where email = ?').bind(email).first();
      await db.prepare('insert into loads (id, owner_id, origin, destination, pickup_date, equipment, weight, pay, company, email, created_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(oldId, `account:${owner.id}`, 'Managua', 'León', '2000-01-01', 'Refrigerado', 1000, 5000, 'Expired local test', email, new Date().toISOString()).run();
      assert(!(await (await api('/api/loads', { cookie })).json()).loads.some(row => row.id === oldId));
      assert((await (await api('/api/loads?mine=1', { cookie })).json()).loads.some(row => row.id === oldId && row.canDelete));
      assert.equal((await api('/api/loads/' + oldId, { method: 'DELETE', cookie })).status, 200);
    });
    await t.test('carriers register, retain their role on login, and see loads only with a session', async () => {
      const carrierEmail = 'carrier-' + suffix + '@example.com';
      const invalid = await api('/api/auth/register', { method: 'POST', body: { name: 'Carrier', email: carrierEmail, password, role: 'admin' } });
      assert.equal(invalid.status, 400);
      const created = await api('/api/auth/register', { method: 'POST', body: { name: 'Carrier', email: carrierEmail, password, role: 'transportista', isAdmin: true, id: adminId } });
      assert.equal(created.status, 201);
      assert.equal((await created.json()).user.role, 'transportista');
      assert.equal((await created.json()).user.isAdmin, false);
      assert.notEqual((await created.json()).user.id, adminId);
      const carrierCookie = cookieFrom(created);
      const active = await api('/api/loads', { cookie: carrierCookie });
      assert.equal(active.status, 200);
      assert(Array.isArray((await active.json()).loads));
      const session = await api('/api/auth/session', { cookie: carrierCookie });
      assert.equal((await session.json()).user.role, 'transportista');
      const loggedIn = await api('/api/auth/login', { method: 'POST', body: { email: carrierEmail, password } });
      assert.equal(loggedIn.status, 200);
      assert.equal((await loggedIn.json()).user.role, 'transportista');
      await api('/api/auth/logout', { method: 'POST', cookie: carrierCookie, body: {} });
      const denied = await api('/api/loads', { cookie: carrierCookie });
      assert.equal(denied.status, 401);
      assert(!('loads' in await denied.json()));
    });
    await t.test('administrator directory is private, searchable, paginated and never exposes password hashes', async () => {
      const anonymous = await api('/api/admin/users');
      assert.equal(anonymous.status, 401);
      assert(!('users' in await anonymous.json()));
      const regular = await api('/api/admin/users', { cookie });
      assert.equal(regular.status, 403);
      assert(!('users' in await regular.json()));
      const passwordRow = await db.prepare('select password_hash from users where email = ?').bind(email).first();
      const adminEmail = 'administrator-' + suffix + '@example.com';
      await db.prepare('insert into users (id, email, name, role, password_hash, created_at) values (?, ?, ?, ?, ?, ?)')
        .bind(adminId, adminEmail, '<script>Admin_%</script>', 'empresa', passwordRow.password_hash, new Date().toISOString()).run();
      const loggedIn = await api('/api/auth/login', { method: 'POST', body: { email: adminEmail, password } });
      assert.equal(loggedIn.status, 200);
      assert.equal((await loggedIn.json()).user.isAdmin, true);
      const adminCookie = cookieFrom(loggedIn);
      assert.equal((await (await api('/api/auth/session', { cookie: adminCookie })).json()).user.isAdmin, true);
      const listing = await api('/api/admin/users', { cookie: adminCookie });
      assert.equal(listing.status, 200);
      const data = await listing.json();
      assert(data.users.length >= 4);
      assert(data.counts.empresas >= 3);
      assert(data.counts.transportistas >= 1);
      for (const row of data.users) assert.deepEqual(Object.keys(row).sort(), ['canDelete', 'createdAt', 'email', 'id', 'isAdmin', 'name', 'role']);
      assert(!JSON.stringify(data).includes(passwordRow.password_hash));
      const carriers = await (await api('/api/admin/users?role=transportista', { cookie: adminCookie })).json();
      assert(carriers.users.length > 0 && carriers.users.every(row => row.role === 'transportista'));
      const found = await (await api('/api/admin/users?q=' + encodeURIComponent(adminEmail), { cookie: adminCookie })).json();
      assert.equal(found.total, 1);
      const escaped = await (await api('/api/admin/users?q=' + encodeURIComponent('_%'), { cookie: adminCookie })).json();
      assert.equal(escaped.total, 1);
      assert.equal(escaped.users[0].id, adminId);
      const injected = await (await api('/api/admin/users?q=' + encodeURIComponent("' OR 1=1--"), { cookie: adminCookie })).json();
      assert.equal(injected.total, 0);
      assert.equal((await api('/api/admin/users?role=admin', { cookie: adminCookie })).status, 400);
      await db.batch(Array.from({ length: 30 }, (_, i) => db.prepare('insert into users (id, email, name, role, password_hash, created_at) values (?, ?, ?, ?, ?, ?)')
        .bind(randomUUID(), 'page-' + i + '-' + suffix + '@example.com', 'Pagination ' + i, i % 2 ? 'empresa' : 'transportista', passwordRow.password_hash, new Date().toISOString())));
      const first = await (await api('/api/admin/users?page=1', { cookie: adminCookie })).json();
      const second = await (await api('/api/admin/users?page=2', { cookie: adminCookie })).json();
      assert.equal(first.users.length, 25);
      assert(second.users.length > 0);
      assert.equal(new Set([...first.users, ...second.users].map(row => row.id)).size, first.total);
      assert.equal(data.administrator.email, adminEmail);
      assert.equal(data.users.find(row => row.id === adminId).canDelete, false);
      assert.equal(data.users.find(row => row.id === adminId).isAdmin, true);
      const victimId = randomUUID();
      const victimEmail = 'delete-user-' + suffix + '@example.com';
      await db.prepare('insert into users (id, email, name, role, password_hash, created_at) values (?, ?, ?, ?, ?, ?)')
        .bind(victimId, victimEmail, 'Temporary account deletion fixture', 'transportista', passwordRow.password_hash, new Date().toISOString()).run();
      const victimLogin = await api('/api/auth/login', { method: 'POST', body: { email: victimEmail, password } });
      assert.equal(victimLogin.status, 200);
      const victimCookie = cookieFrom(victimLogin);
      const victimCargo = await api('/api/loads', { method: 'POST', cookie: victimCookie, body: { origin: 'A', destination: 'B', pickupDate: '2099-12-01', equipment: 'Refrigerado', weight: 1000, pay: 5000, company: 'Temporary test account', email: victimEmail } });
      assert.equal(victimCargo.status, 201);
      const endpoint = '/api/admin/users/' + victimId;
      assert.equal((await api(endpoint, { method: 'DELETE' })).status, 401);
      assert.equal((await api(endpoint, { method: 'DELETE', cookie })).status, 403);
      assert.equal((await api(endpoint, { method: 'DELETE', cookie: adminCookie, headers: { Origin: 'https://other.example' } })).status, 403);
      assert.equal((await api('/api/admin/users/' + adminId, { method: 'DELETE', cookie: adminCookie })).status, 403);
      assert(await db.prepare('select id from users where id = ?').bind(adminId).first());
      assert.equal((await api(endpoint, { method: 'DELETE', cookie: adminCookie })).status, 200);
      assert.equal(await db.prepare('select id from users where id = ?').bind(victimId).first(), null);
      assert.equal(await db.prepare('select user_id from sessions where user_id = ?').bind(victimId).first(), null);
      assert.equal(await db.prepare('select id from loads where owner_id = ?').bind('account:' + victimId).first(), null);
      assert.equal((await (await api('/api/auth/session', { cookie: victimCookie })).json()).user, null);
      assert.equal((await api('/api/auth/login', { method: 'POST', body: { email: victimEmail, password } })).status, 401);
      assert.equal((await api(endpoint, { method: 'DELETE', cookie: adminCookie })).status, 404);
      assert.equal((await (await api('/api/auth/session', { cookie })).json()).user.email, email);
      await api('/api/auth/logout', { method: 'POST', cookie: adminCookie, body: {} });
      assert.equal((await api('/api/admin/users', { cookie: adminCookie })).status, 401);
    });
    await t.test('temporary owner lookup requires its secret and only looks up the configured account', async () => {
      assert.equal((await api('/api/admin/setup-lookup')).status, 404);
      assert.equal((await api('/api/admin/setup-lookup', { headers: { Authorization: 'Bearer incorrect' } })).status, 404);
      const result = await api('/api/admin/setup-lookup?email=other@example.com', { headers: { Authorization: 'Bearer ' + setupToken } });
      assert.equal(result.status, 200);
      const body = await result.json();
      const expected = await db.prepare('select id from users where email = ?').bind(email).first();
      assert.equal(body.userId, expected.id);
      assert.equal(body.found, true);
      assert.deepEqual(Object.keys(body).sort(), ['found', 'userId']);
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
