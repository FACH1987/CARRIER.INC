import { desc, eq, or, sql } from 'drizzle-orm';
import { getDb } from '../../../db';
import { loadMessages, loads, users } from '../../../db/schema';
import { AuthError, authFailure, currentAccount, responseJson } from '../../../lib/account-auth';
import { chatPublicName } from '../../../lib/load-chat';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const account = await currentAccount(request);
    if (!account) throw new AuthError('Inicia sesión para ver tus chats.', 401);
    if (account.isAdmin) throw new AuthError('Los chats entre clientes son privados.', 403);
    const ownerId = `account:${account.id}`;
    const latest = sql<string>`max(${loadMessages.createdAt})`;
    const threads = await getDb().select({
      loadId: loads.id, ownerId: loads.ownerId, carrierId: loadMessages.carrierId,
      company: loads.company, carrierName: users.name, origin: loads.origin, destination: loads.destination, latest,
    }).from(loadMessages).innerJoin(loads, eq(loadMessages.loadId, loads.id))
      .innerJoin(users, eq(users.id, loadMessages.carrierId))
      .where(or(eq(loads.ownerId, ownerId), eq(loadMessages.carrierId, account.id)))
      .groupBy(loads.id, loadMessages.carrierId).orderBy(desc(latest)).limit(100);
    return responseJson({ threads: threads.map(thread => {
      const owner = thread.ownerId === ownerId;
      const name = owner ? thread.carrierName : thread.company;
      return { loadId: thread.loadId, carrierId: owner ? thread.carrierId : null, name: chatPublicName(name, 'Participante'),
        origin: chatPublicName(thread.origin, 'Origen'), destination: chatPublicName(thread.destination, 'Destino'), latest: thread.latest };
    }) });
  } catch (error) { return authFailure(error); }
}
