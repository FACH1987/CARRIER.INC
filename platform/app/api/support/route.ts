import { env } from 'cloudflare:workers';
import { asc, desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '../../../db';
import { supportMessages, users } from '../../../db/schema';
import { AuthError, authFailure, checkAuthLimit, currentAccount, readAuthJson, responseJson } from '../../../lib/account-auth';
import { activePlan } from '../../../lib/subscriptions';

export const dynamic = 'force-dynamic';
const messageSchema = z.object({ body: z.string().trim().min(2).max(800), userId: z.string().uuid().optional() });
const config = env as unknown as { SUPPORT_EXECUTIVE?: string };

export async function GET(request: Request) {
  try {
    const account = await currentAccount(request);
    if (!account) throw new AuthError('Inicia sesión para acceder al soporte.', 401);
    const target = new URL(request.url).searchParams.get('userId');
    if (target && (!account.isAdmin || !z.string().uuid().safeParse(target).success)) throw new AuthError('Acceso privado.', 403);
    const db = getDb();
    if (account.isAdmin && !target) {
      const priority = sql<number>`max(${supportMessages.priority})`;
      const latest = sql<string>`max(${supportMessages.createdAt})`;
      const conversations = await db.select({ id: users.id, name: users.name, priority }).from(supportMessages)
        .innerJoin(users, eq(users.id, supportMessages.userId)).groupBy(users.id, users.name)
        .orderBy(desc(priority), desc(latest)).limit(100);
      return responseJson({ admin: true, conversations });
    }
    const messages = await db.select({ id: supportMessages.id, body: supportMessages.body,
      fromSupport: supportMessages.fromSupport, createdAt: supportMessages.createdAt }).from(supportMessages)
      .where(eq(supportMessages.userId, target || account.id)).orderBy(desc(supportMessages.createdAt), asc(supportMessages.id)).limit(100);
    const plan = target ? null : await activePlan(account.id);
    return responseJson({ admin: account.isAdmin, plan, messages: messages.reverse(),
      executive: plan === 'corporativo' ? config.SUPPORT_EXECUTIVE?.trim() || null : null });
  } catch (error) { return authFailure(error); }
}

export async function POST(request: Request) {
  try {
    const account = await currentAccount(request);
    if (!account) throw new AuthError('Inicia sesión para acceder al soporte.', 401);
    const parsed = messageSchema.safeParse(await readAuthJson(request));
    if (!parsed.success) throw new AuthError('Escribe un mensaje de hasta 800 caracteres.');
    const { body, userId } = parsed.data;
    if (Boolean(userId) !== account.isAdmin) throw new AuthError('Acceso privado.', 403);
    await checkAuthLimit('support-message', account.id, 60, 3600);
    const db = getDb();
    if (userId) {
      const [conversation] = await db.select({ id: supportMessages.id }).from(supportMessages)
        .where(eq(supportMessages.userId, userId)).limit(1);
      if (!conversation) throw new AuthError('Conversación no encontrada.', 404);
    }
    const plan = await activePlan(userId || account.id);
    const priority = plan === 'corporativo' ? 2 : plan === 'negocio' ? 1 : 0;
    await db.insert(supportMessages).values({ id: crypto.randomUUID(), userId: userId || account.id,
      fromSupport: account.isAdmin, body, priority, createdAt: new Date().toISOString() });
    return responseJson({ saved: true }, 201);
  } catch (error) { return authFailure(error); }
}
