import { createHash, randomBytes } from 'node:crypto';
import { and, eq, gt, sql } from 'drizzle-orm';
import { getDb } from '../db';
import { authLimits, sessions, users } from '../db/schema';
import { withAdminAccess } from './admin-policy';

export type Account = { id: string; name: string; email: string; role: 'empresa' | 'transportista' | 'administrador'; isAdmin: boolean };
export class AuthError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
export const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const lifetime = 7 * 24 * 60 * 60;
function cookieName(request: Request) {
  const url = new URL(request.url);
  if (url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) return 'rutacarga_local_session';
  return '__Host-rutacarga_session';
}
function sessionToken(request: Request): string | null {
  const cookie = (request.headers.get('cookie') || '').split(';').map(value => value.trim()).find(value => value.startsWith(cookieName(request) + '='));
  const value = cookie?.slice(cookie.indexOf('=') + 1);
  return value && /^[A-Za-z0-9_-]{43}$/.test(value) ? value : null;
}
function cookie(request: Request, token: string, age: number) {
  const name = cookieName(request);
  return `${name}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${age}${name.startsWith('__Host-') ? '; Secure' : ''}`;
}
export function responseJson(body: unknown, status = 200, cookieValue?: string) {
  const headers = new Headers({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Vary': 'Cookie' });
  if (cookieValue) headers.set('Set-Cookie', cookieValue);
  return Response.json(body, { status, headers });
}
export async function currentAccount(request: Request): Promise<Account | null> {
  const token = sessionToken(request);
  if (!token) return null;
  const [account] = await getDb().select({ id: users.id, name: users.name, email: users.email, role: users.role }).from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(and(eq(sessions.tokenHash, digest(token)), gt(sessions.expiresAt, Date.now()))).limit(1);
  return account ? withAdminAccess(account) : null;
}
export function requireSameOrigin(request: Request) {
  if (request.headers.get('origin') !== new URL(request.url).origin) throw new AuthError('Solicitud no válida. Recarga la página e intenta de nuevo.', 403);
}
export async function readAuthJson(request: Request): Promise<unknown> {
  requireSameOrigin(request);
  if (!request.headers.get('content-type')?.startsWith('application/json')) throw new AuthError('Formato no válido.', 415);
  if (Number(request.headers.get('content-length') || 0) > 4096) throw new AuthError('La solicitud es demasiado grande.', 413);
  const reader = request.body?.getReader();
  if (!reader) throw new AuthError('Completa los datos.');
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > 4096) { await reader.cancel(); throw new AuthError('La solicitud es demasiado grande.', 413); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  try { return JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new AuthError('Los datos no son válidos.'); }
}
export async function checkAuthLimit(scope: string, identity: string, limit: number, seconds: number) {
  const period = Math.floor(Date.now() / (seconds * 1000));
  const key = digest(`${scope}:${identity}:${period}`);
  const [result] = await getDb().insert(authLimits).values({ key, attempts: 1, expiresAt: (period + 1) * seconds * 1000 })
    .onConflictDoUpdate({ target: authLimits.key, set: { attempts: sql`${authLimits.attempts} + 1` } }).returning({ attempts: authLimits.attempts });
  if (result.attempts > limit) throw new AuthError('Demasiados intentos. Espera unos minutos antes de volver a intentarlo.', 429);
}
export async function startSession(request: Request, userId: string) {
  const db = getDb();
  const token = randomBytes(32).toString('base64url');
  const previous = sessionToken(request);
  if (previous) await db.delete(sessions).where(eq(sessions.tokenHash, digest(previous)));
  await db.insert(sessions).values({ tokenHash: digest(token), userId, expiresAt: Date.now() + lifetime * 1000 });
  await db.delete(sessions).where(sql`${sessions.tokenHash} in (select token_hash from sessions where expires_at < ${Date.now()} limit 100)`);
  await db.delete(authLimits).where(sql`${authLimits.key} in (select key from auth_limits where expires_at < ${Date.now()} limit 100)`);
  return cookie(request, token, lifetime);
}
export async function endSession(request: Request) {
  requireSameOrigin(request);
  const token = sessionToken(request);
  if (token) await getDb().delete(sessions).where(eq(sessions.tokenHash, digest(token)));
  return cookie(request, '', 0);
}
export function authFailure(error: unknown) {
  if (error instanceof AuthError) return responseJson({ error: error.message }, error.status);
  // Never log passwords, cookies, request bodies or database values.
  console.error('No se pudo completar la operación de cuenta.');
  return responseJson({ error: 'No pudimos completar la operación. Intenta de nuevo.' }, 503);
}
