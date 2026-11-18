import { and, asc, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '../../../../../db';
import { loadMessages, loads } from '../../../../../db/schema';
import { AuthError, authFailure, checkAuthLimit, currentAccount, readAuthJson, responseJson } from '../../../../../lib/account-auth';
import { carrierDossier, todayNI } from '../../../../../lib/carrier-compliance';
import { chatPublicName, containsExternalContact, loadChatParticipants } from '../../../../../lib/load-chat';

export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ id: string }> };
const messageSchema = z.object({ body: z.string().trim().min(1).max(800), carrierId: z.string().uuid().optional() });

async function access(request: Request, context: Context) {
  const account = await currentAccount(request);
  if (!account) throw new AuthError('Inicia sesión para abrir el chat.', 401);
  const { id } = await context.params;
  if (!z.string().uuid().safeParse(id).success || account.isAdmin) throw new AuthError('Carga no encontrada.', 404);
  const db = getDb();
  const [load] = await db.select({ id: loads.id, ownerId: loads.ownerId, carrierId: loads.carrierId,
    origin: loads.origin, destination: loads.destination, pickupDate: loads.pickupDate,
    status: loads.status }).from(loads).where(eq(loads.id, id)).limit(1);
  if (!load) throw new AuthError('Carga no encontrada.', 404);
  const owner = load.ownerId === `account:${account.id}`;
  if (!owner && account.role !== 'transportista') throw new AuthError('Chat privado.', 403);
  const open = load.status === 'disponible' && load.pickupDate >= todayNI();
  return { account, db, load, owner, open };
}

async function threadAccess(state: Awaited<ReturnType<typeof access>>, selected: string | null) {
  const { account, db, load, owner, open } = state;
  const participants = owner ? await loadChatParticipants(load) : [];
  const carrierId = owner ? selected : account.id;
  if (selected && !z.string().uuid().safeParse(selected).success) throw new AuthError('Conversación no encontrada.', 404);
  if (owner && carrierId && !participants.some(user => user.id === carrierId)) throw new AuthError('Conversación no encontrada.', 404);
  if (!owner && selected && selected !== account.id) throw new AuthError('Chat privado.', 403);
  if (!carrierId) return { participants, carrierId, canSend: false };
  if (!open && load.carrierId !== carrierId) {
    const [historical] = await db.select({ id: loadMessages.id }).from(loadMessages)
      .where(and(eq(loadMessages.loadId, load.id), eq(loadMessages.carrierId, carrierId))).limit(1);
    if (!owner && !historical) throw new AuthError('Conversación no disponible.', 404);
    return { participants, carrierId, canSend: false };
  }
  if (!owner && load.carrierId !== account.id && !(await carrierDossier(account.id)).ready)
    throw new AuthError('Completa tu expediente para contactar a quien publicó la carga.', 403);
  return { participants, carrierId, canSend: true };
}

export async function GET(request: Request, context: Context) {
  try {
    const state = await access(request, context);
    const selected = new URL(request.url).searchParams.get('carrier');
    const { carrierId, participants, canSend } = await threadAccess(state, selected);
    const { db, load, owner } = state;
    const messages = carrierId ? await db.select({ id: loadMessages.id, fromCarrier: loadMessages.fromCarrier,
      body: loadMessages.body, createdAt: loadMessages.createdAt }).from(loadMessages)
      .where(and(eq(loadMessages.loadId, load.id), eq(loadMessages.carrierId, carrierId)))
      .orderBy(desc(loadMessages.createdAt), asc(loadMessages.id)).limit(100) : [];
    return responseJson({ owner, participants, canSend, messages: messages.reverse(),
      route: chatPublicName(load.origin, 'Origen') + ' → ' + chatPublicName(load.destination, 'Destino') });
  } catch (error) { return authFailure(error); }
}

export async function POST(request: Request, context: Context) {
  try {
    const state = await access(request, context);
    const data = messageSchema.safeParse(await readAuthJson(request));
    if (!data.success) throw new AuthError('Escribe un mensaje de hasta 800 caracteres.');
    if (containsExternalContact(data.data.body)) throw new AuthError('Mantén la comunicación en el chat. Quita números de teléfono, correos y enlaces de contacto.', 400);
    const { carrierId, canSend } = await threadAccess(state, data.data.carrierId ?? null);
    if (!carrierId || !canSend) throw new AuthError('Esta conversación es de solo lectura.', 409);
    await checkAuthLimit('load-chat', state.account.id, 100, 3600);
    await state.db.insert(loadMessages).values({ id: crypto.randomUUID(), loadId: state.load.id,
      carrierId, fromCarrier: !state.owner, body: data.data.body, createdAt: new Date().toISOString() });
    return responseJson({ saved: true }, 201);
  } catch (error) { return authFailure(error); }
}
