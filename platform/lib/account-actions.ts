import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '../db';
import { users } from '../db/schema';
import { hashPassword, verifyPassword } from './passwords';
import { withAdminAccess } from './admin-policy';
import { AuthError, authFailure, checkAuthLimit, readAuthJson, responseJson, startSession } from './account-auth';

const emailSchema = z.string().trim().email().max(120).transform(value => value.toLowerCase());
const loginSchema = z.object({ email: emailSchema, password: z.string().min(1).max(128) });
const registerSchema = z.object({ email: emailSchema, password: z.string().min(12).max(128), name: z.string().trim().min(2).max(80), role: z.enum(['empresa', 'transportista']).default('empresa') });

export async function register(request: Request) {
  try {
    const body = await readAuthJson(request);
    const parsed = registerSchema.safeParse(body);
    if (!parsed.success) throw new AuthError('Completa tu nombre, un correo válido y una contraseña de 12 a 128 caracteres.');
    const data = parsed.data;
    await checkAuthLimit('register-ip', request.headers.get('cf-connecting-ip') || 'unknown', 6, 3600);
    await checkAuthLimit('register-email', data.email, 6, 3600);
    const db = getDb();
    const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, data.email)).limit(1);
    if (existing) throw new AuthError('No se pudo crear la cuenta con ese correo. Si ya tienes una cuenta, inicia sesión.', 409);
    const account = { id: crypto.randomUUID(), name: data.name, email: data.email, role: data.role };
    await db.insert(users).values({ ...account, passwordHash: await hashPassword(data.password), createdAt: new Date().toISOString() });
    return responseJson({ user: withAdminAccess(account), onboardingRequired: data.role === 'transportista' }, 201, await startSession(request, account.id));
  } catch (error) { return authFailure(error); }
}

export async function login(request: Request) {
  try {
    const body = await readAuthJson(request);
    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) throw new AuthError('Ingresa tu correo y contraseña.');
    await checkAuthLimit('login-ip', request.headers.get('cf-connecting-ip') || 'unknown', 30, 900);
    await checkAuthLimit('login-email', parsed.data.email, 10, 900);
    const [stored] = await getDb().select().from(users).where(eq(users.email, parsed.data.email)).limit(1);
    const valid = await verifyPassword(parsed.data.password, stored?.passwordHash);
    if (!stored || !valid) throw new AuthError('Correo o contraseña incorrectos.', 401);
    const account = { id: stored.id, name: stored.name, email: stored.email, role: stored.role };
    return responseJson({ user: withAdminAccess(account) }, 200, await startSession(request, stored.id));
  } catch (error) { return authFailure(error); }
}
