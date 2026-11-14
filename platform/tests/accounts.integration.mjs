import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { Miniflare } from 'miniflare';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { dayInNicaragua, addYears } from '../lib/document-rules.ts';
const testDay = dayInNicaragua();
const afterDays = days => new Date(Date.parse(testDay + 'T00:00:00Z') + days * 86400000).toISOString().slice(0, 10);

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
test('local accounts, private carrier documents, verified dispatch and commissions', { timeout: 60000 }, async t => {
  runtime = new Miniflare({
    modules: [
      { type: 'ESModule', path: path.resolve('dist/server/index.js') },
      ...readdirSync('dist/server', { recursive: true }).filter(name => name.endsWith('.js') && name !== 'index.js')
        .map(name => ({ type: 'ESModule', path: path.resolve('dist/server', name) }))
    ],
    modulesRoot: path.resolve('dist/server'),
    compatibilityDate: '2026-05-15', compatibilityFlags: ['nodejs_compat'],
    d1Databases: ['DB'], d1Persist: false,
    r2Buckets: ['DOCUMENTS'], r2Persist: false,
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
      const cargo = { origin: 'Managua', destination: 'León', pickupDate: '2099-12-01', equipment: 'Refrigerado', weight: 1200, pay: 5000, acceptCommission: true, company: 'Local integration test', email };
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
      assert.equal(active.status, 403);
      assert.equal((await active.json()).onboardingRequired, true);
      assert.equal((await created.json()).onboardingRequired, true);
      assert.equal((await api('/api/loads?mine=1', { cookie: carrierCookie })).status, 200);
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
        .bind(victimId, victimEmail, 'Temporary account deletion fixture', 'empresa', passwordRow.password_hash, new Date().toISOString()).run();
      const victimLogin = await api('/api/auth/login', { method: 'POST', body: { email: victimEmail, password } });
      assert.equal(victimLogin.status, 200);
      const victimCookie = cookieFrom(victimLogin);
      const victimCargo = await api('/api/loads', { method: 'POST', cookie: victimCookie, body: { origin: 'A', destination: 'B', pickupDate: '2099-12-01', equipment: 'Refrigerado', weight: 1000, pay: 5000, acceptCommission: true, company: 'Temporary test account', email: victimEmail } });
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
      const carrierAccount = await db.prepare("select id, email from users where role = 'transportista' and email like 'carrier-%'").first();
      const carrierLogin = await api('/api/auth/login', { method: 'POST', body: { email: carrierAccount.email, password } });
      const carrierSession = cookieFrom(carrierLogin);
      assert.equal((await api('/api/carrier')).status, 401);
      assert.equal((await api('/api/carrier?userId=' + carrierAccount.id, { cookie })).status, 403);
      assert.equal((await api('/api/carrier', { method: 'POST', cookie: carrierSession, body: { action: 'profile', kind: 'flota', legalName: 'Fleet fixture', consent: true } })).status, 201);
      const createdDriver = await api('/api/carrier', { method: 'POST', cookie: carrierSession, body: { action: 'driver', name: 'Driver fixture', categories: ['4A'] } });
      assert.equal(createdDriver.status, 201);
      const driverId = (await createdDriver.json()).id;
      const vehicleData = { action: 'vehicle', driverId, plate: 'M-TEST-001', description: 'Truck fixture', equipment: 'Refrigerado', capacityKg: 5000, requiredCategory: '4A' };
      assert.equal((await api('/api/carrier', { method: 'POST', cookie: carrierSession, body: { ...vehicleData, requiredCategory: '6A' } })).status, 400);
      const createdVehicle = await api('/api/carrier', { method: 'POST', cookie: carrierSession, body: vehicleData });
      assert.equal(createdVehicle.status, 201);
      const vehicleId = (await createdVehicle.json()).id;
      const secondVehicle = await api('/api/carrier', { method: 'POST', cookie: carrierSession, body: { ...vehicleData, plate: 'M-TEST-002' } });
      assert.equal(secondVehicle.status, 201);
      const independentId = randomUUID(), independentEmail = 'independent-' + suffix + '@example.com';
      await db.prepare('insert into users (id,email,name,role,password_hash,created_at) values (?,?,?,?,?,?)').bind(independentId, independentEmail, 'Independent fixture', 'transportista', passwordRow.password_hash, new Date().toISOString()).run();
      const independentLogin = await api('/api/auth/login', { method: 'POST', body: { email: independentEmail, password } });
      const independentSession = cookieFrom(independentLogin);
      assert.equal((await api('/api/carrier', { method: 'POST', cookie: independentSession, body: { action: 'profile', kind: 'independiente', legalName: 'Independent fixture', consent: false } })).status, 400);
      assert.equal((await api('/api/carrier', { method: 'POST', cookie: independentSession, body: { action: 'profile', kind: 'independiente', legalName: 'Independent fixture', consent: true } })).status, 201);
      const independentDriver = await api('/api/carrier', { method: 'POST', cookie: independentSession, body: { action: 'driver', name: 'Independent fixture', categories: ['4A'] } });
      assert.equal(independentDriver.status, 201);
      assert.equal((await api('/api/carrier', { method: 'POST', cookie: independentSession, body: { action: 'driver', name: 'Another fixture', categories: ['4A'] } })).status, 409);
      assert.equal((await api('/api/carrier', { method: 'POST', cookie: independentSession, body: { ...vehicleData, plate: 'I-TEST-001' } })).status, 400);
      assert.equal((await api('/api/carrier', { method: 'POST', cookie: independentSession, body: { ...vehicleData, driverId: (await independentDriver.json()).id, plate: 'I-TEST-001' } })).status, 201);
      assert.equal((await api('/api/carrier', { method: 'POST', cookie: independentSession, body: { ...vehicleData, driverId: (await independentDriver.json()).id, plate: 'I-TEST-002' } })).status, 409);
      // Unassigned account deletion must also remove fleet/driver references safely.
      assert.equal((await api('/api/admin/users/' + independentId, { method: 'DELETE', cookie: adminCookie })).status, 200);
      // This second truck remains incomplete and must never be offered for dispatch.
      const upload = async (metadata, { session = carrierSession, content = '%PDF-1.4\nIsolated test fixture only', origin = base, mime = 'application/pdf' } = {}) => {
        const result = await runtime.dispatchFetch(base + '/api/carrier/documents', { method: 'POST', headers: { Origin: origin, Cookie: session, 'Content-Type': mime, 'X-Document-Metadata': encodeURIComponent(new URLSearchParams(metadata).toString()) }, body: content });
        return { status: result.status, data: await result.json() };
      };
      let dossier = await (await api('/api/carrier', { cookie: carrierSession })).json();
      const metadata = { entityType: 'driver', entityId: driverId, type: 'license', issuedAt: testDay, expiresAt: addYears(testDay, 5) };
      assert.equal((await upload({ ...metadata, expiresAt: '2000-01-01' })).status, 400);
      assert.equal((await upload({ ...metadata, expiresAt: '2100-02-30' })).status, 400);
      assert.equal((await upload(metadata, { content: '<script>bad</script>', mime: 'image/png' })).status, 400);
      assert.equal((await upload(metadata, { origin: 'https://other.example' })).status, 403);
      assert.equal((await upload({ ...metadata, entityId: randomUUID() })).status, 404);
      assert.equal((await upload({ ...metadata, exemption: 'Does not apply to my driver license' })).status, 400);
      assert.equal((await upload({ ...metadata, expiresAt: addYears(testDay, 6) })).status, 400);
      const slots = [
        ...dossier.profileChecklist.map(item => ({ entityType: 'profile', entityId: carrierAccount.id, type: item.type })),
        ...dossier.drivers[0].checklist.map(item => ({ entityType: 'driver', entityId: driverId, type: item.type })),
        ...dossier.vehicles[0].checklist.map(item => ({ entityType: 'vehicle', entityId: vehicleId, type: item.type }))
      ];
      const slotMetadata = slot => ({ ...metadata, ...slot, expiresAt: addYears(testDay, slot.type === 'emissions' ? 1 : 5) });
      for (const slot of slots.slice(0, -1)) assert.equal((await upload(slotMetadata(slot))).status, 201);
      assert.equal((await api('/api/loads', { cookie: carrierSession })).status, 403);
      assert.equal((await upload(slotMetadata(slots.at(-1)))).status, 201);
      // The final current document enables access without any administrator review.
      assert.equal((await api('/api/loads', { cookie: carrierSession })).status, 200);
      const automatic = await (await api('/api/carrier', { cookie: carrierSession })).json();
      assert.equal(automatic.ready, true);
      assert(automatic.drivers[0].checklist.every(item => item.document.reviewedAt === null));
      assert.equal((await api('/api/carrier/notifications')).status, 401);
      assert.equal((await api('/api/carrier/notifications', { cookie })).status, 403);
      assert.equal((await upload({ ...metadata, expiresAt: afterDays(10) })).status, 201);
      let notices = await (await api('/api/carrier/notifications', { cookie: carrierSession })).json();
      assert.equal(notices.alerts.length, 1);
      assert.equal(notices.alerts[0].stage, '15');
      assert.equal(notices.unread, 1);
      const readId = notices.alerts[0].id;
      assert(!JSON.stringify(notices).includes('objectKey'));
      assert.equal((await api('/api/carrier/notifications', { method: 'POST', cookie: carrierSession, body: { ids: [readId] }, headers: { Origin: 'https://other.example' } })).status, 403);
      assert.equal((await api('/api/carrier/notifications', { method: 'POST', cookie: carrierSession, body: { ids: ['a'.repeat(64)] } })).status, 409);
      assert.equal((await api('/api/carrier/notifications', { method: 'POST', cookie: carrierSession, body: { ids: [readId] } })).status, 200);
      notices = await (await api('/api/carrier/notifications', { cookie: carrierSession })).json();
      assert.equal(notices.unread, 0);
      assert.equal(notices.alerts.length, 1);
      await db.prepare("update carrier_documents set issued_at = ?, expires_at = ? where user_id = ? and entity_type = 'driver' and type = 'license'").bind(afterDays(-365), afterDays(-1), carrierAccount.id).run();
      notices = await (await api('/api/carrier/notifications', { cookie: carrierSession })).json();
      assert.equal(notices.alerts[0].stage, 'expired');
      assert.equal(notices.unread, 1);
      assert.equal(notices.accessAllowed, false);
      assert.equal((await api('/api/loads', { cookie: carrierSession })).status, 403);
      assert.equal((await api('/api/loads?mine=1', { cookie: carrierSession })).status, 200);
      // Renewal restores access and removes the obsolete warning without admin approval.
      assert.equal((await upload(metadata)).status, 201);
      assert.equal((await api('/api/loads', { cookie: carrierSession })).status, 200);
      notices = await (await api('/api/carrier/notifications', { cookie: carrierSession })).json();
      assert.equal(notices.alerts.length, 0);
      dossier = await (await api('/api/carrier?userId=' + carrierAccount.id, { cookie: adminCookie })).json();
      const docs = [...dossier.profileChecklist, ...dossier.drivers[0].checklist, ...dossier.vehicles[0].checklist].map(item => item.document);
      const privateUrl = '/api/carrier/documents/' + docs[0].id;
      assert.equal((await runtime.dispatchFetch(base + privateUrl)).status, 401);
      assert.equal((await runtime.dispatchFetch(base + privateUrl, { headers: { Cookie: cookie } })).status, 404);
      const download = await runtime.dispatchFetch(base + privateUrl, { headers: { Cookie: adminCookie } });
      assert.equal(download.status, 200);
      assert.match(download.headers.get('content-disposition'), /^attachment;/);
      assert.match(download.headers.get('cache-control'), /no-store/);
      assert(!JSON.stringify(dossier).includes('objectKey'));
      const review = (doc, session = adminCookie, overrides = {}) => api('/api/admin/documents/' + doc.id + '/review', { method: 'POST', cookie: session, body: { revision: doc.revision, status: 'approved', note: 'Reviewed isolated test fixture', attest: true, ...overrides } });
      assert.equal((await review(docs[0], carrierSession)).status, 403);
      assert.equal((await review(docs[0], adminCookie, { revision: randomUUID() })).status, 409);
      for (const doc of docs) assert.equal((await review(doc)).status, 200);
      assert.equal((await api('/api/loads', { cookie: carrierSession })).status, 200);
      dossier = await (await api('/api/carrier', { cookie: carrierSession })).json();
      assert.equal(dossier.ready, true);
      assert.equal(dossier.vehicles.filter(v => v.ready).length, 1);
      // A valid replacement keeps access immediately without a new review.
      const license = dossier.drivers[0].checklist.find(item => item.type === 'license').document;
      assert.equal((await upload(metadata)).status, 201);
      assert.equal((await api('/api/loads', { cookie: carrierSession })).status, 200);
      assert.equal((await review(license)).status, 409);
      const newLicense = (await (await api('/api/carrier', { cookie: carrierSession })).json()).drivers[0].checklist.find(item => item.type === 'license').document;
      assert.equal((await review(newLicense, adminCookie, { status: 'rejected', note: 'Correction required for fixture' })).status, 200);
      assert.equal((await api('/api/loads', { cookie: carrierSession })).status, 403);
      assert.equal((await review(newLicense)).status, 200);
      await db.prepare('update carrier_documents set expires_at = ? where id = ?').bind('2000-01-01', newLicense.id).run();
      assert.equal((await api('/api/loads', { cookie: carrierSession })).status, 403);
      assert.equal((await review(newLicense)).status, 409);
      await db.prepare('update carrier_documents set expires_at = ? where id = ?').bind(metadata.expiresAt, newLicense.id).run();
      const freight = { origin: 'Managua', destination: 'Leon', pickupDate: afterDays(7), equipment: 'Refrigerado', weight: 1000, pay: 100.05, company: 'Commission test', email };
      assert.equal((await api('/api/loads', { method: 'POST', cookie, body: freight })).status, 400);
      const posted = await api('/api/loads', { method: 'POST', cookie, body: { ...freight, acceptCommission: true, feeCents: 1 } });
      assert.equal(posted.status, 201);
      const financialLoad = (await posted.json()).load;
      assert.equal(financialLoad.quote.commissionCents, 1001);
      assert.equal(financialLoad.quote.totalCents, 11006);
      const workflow = '/api/loads/' + financialLoad.id + '/workflow';
      const act = (action, session = cookie, extra = {}) => api(workflow, { method: 'POST', cookie: session, body: { action, ...(action === 'assign' ? { vehicleId } : {}), ...extra } });
      const options = await act('options', cookie, { carrierEmail: carrierAccount.email });
      assert.equal(options.status, 200);
      assert.deepEqual((await options.json()).vehicles.map(v => v.id), [vehicleId]);
      await db.prepare('update carrier_documents set expires_at = ? where id = ?').bind(afterDays(2), newLicense.id).run();
      assert.equal((await api('/api/loads', { cookie: carrierSession })).status, 200);
      assert.deepEqual((await (await act('options', cookie, { carrierEmail: carrierAccount.email })).json()).vehicles, []);
      assert.equal((await act('assign', cookie, { carrierEmail: carrierAccount.email, acceptCommission: true })).status, 403);
      await db.prepare('update carrier_documents set expires_at = ? where id = ?').bind(metadata.expiresAt, newLicense.id).run();
      assert.equal((await act('assign', cookie, { carrierEmail: carrierAccount.email, acceptCommission: true, vehicleId: (await secondVehicle.json()).id })).status, 403);
      assert.equal((await act('complete')).status, 409);
      assert.equal((await act('assign', carrierSession, { carrierEmail: carrierAccount.email, acceptCommission: true })).status, 403);
      assert.equal((await act('assign', cookie, { carrierEmail: email, acceptCommission: true })).status, 400);
      assert.equal((await act('assign', cookie, { carrierEmail: carrierAccount.email, acceptCommission: true })).status, 200);
      assert.equal((await act('deliver', carrierSession)).status, 409);
      assert.equal((await act('reject', carrierSession)).status, 200);
      assert.equal((await db.prepare('select count(*) as n from commissions').first()).n, 0);
      assert.equal((await act('assign', cookie, { carrierEmail: carrierAccount.email, acceptCommission: true })).status, 200);
      assert.equal((await act('accept', cookie)).status, 403);
      assert.equal((await act('accept', carrierSession)).status, 200);
      assert.equal((await act('cancel_assignment')).status, 409);
      assert.equal((await api('/api/loads/' + financialLoad.id, { method: 'DELETE', cookie })).status, 409);
      assert.equal((await api('/api/admin/users/' + carrierAccount.id, { method: 'DELETE', cookie: adminCookie })).status, 409);
      assert.equal((await act('deliver', carrierSession)).status, 200);
      assert.equal((await act('complete', carrierSession)).status, 403);
      const completed = await Promise.all([act('complete'), act('complete')]);
      assert(completed.every(result => result.status === 200));
      const invoices = await db.prepare('select * from commissions where load_id = ?').bind(financialLoad.id).all();
      assert.equal(invoices.results.length, 1);
      const invoice = invoices.results[0];
      assert.equal(invoice.amount_cents, 1001);
      assert.equal(invoice.fare_cents, 10005);
      assert.equal(invoice.status, 'pending');
      assert.equal((await api('/api/admin/commissions')).status, 401);
      assert.equal((await api('/api/admin/commissions', { cookie })).status, 403);
      const ledger = await (await api('/api/admin/commissions', { cookie: adminCookie })).json();
      assert.equal(ledger.totals.pendingCents, 1001);
      const settle = '/api/admin/commissions/' + invoice.id + '/settle';
      assert.equal((await api(settle, { method: 'POST', cookie, body: { reference: 'BANK-123', confirmReceived: true } })).status, 403);
      assert.equal((await api(settle, { method: 'POST', cookie: adminCookie, body: { reference: 'BANK-123' } })).status, 400);
      assert.equal((await api(settle, { method: 'POST', cookie: adminCookie, body: { reference: 'BANK-123', confirmReceived: true } })).status, 200);
      assert.equal((await api(settle, { method: 'POST', cookie: adminCookie, body: { reference: 'BANK-OTHER', confirmReceived: true } })).status, 409);
      const paidLedger = await (await api('/api/admin/commissions?status=paid', { cookie: adminCookie })).json();
      assert.equal(paidLedger.totals.pendingCents, 0);
      assert.equal(paidLedger.totals.paidCents, 1001);
      assert.equal(paidLedger.commissions[0].paymentReference, 'BANK-123');
      assert.equal((await api('/api/loads/' + financialLoad.id, { method: 'DELETE', cookie })).status, 409);
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
