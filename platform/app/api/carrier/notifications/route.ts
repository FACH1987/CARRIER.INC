import { z } from 'zod';
import { getDb } from '../../../../db';
import { carrierNoticeReads, loadNoticeReads } from '../../../../db/schema';
import { currentAccount, readAuthJson, responseJson, AuthError, authFailure } from '../../../../lib/account-auth';
import { carrierNotifications } from '../../../../lib/carrier-notifications';
import { newLoadNotifications } from '../../../../lib/load-notifications';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  try {
    const account = await currentAccount(request);
    if (!account) throw new AuthError('Inicia sesión para ver tus avisos.', 401);
    if (account.role !== 'transportista') throw new AuthError('Solo transportistas.', 403);
    const [documents, loadAlerts] = await Promise.all([carrierNotifications(account.id), newLoadNotifications(account.id)]);
    return responseJson({ ...documents, loadAlerts, unread: documents.unread + loadAlerts.filter(alert => !alert.read).length });
  } catch (error) { return authFailure(error); }
}
export async function POST(request: Request) {
  try {
    const account = await currentAccount(request);
    if (!account) throw new AuthError('Inicia sesión para ver tus avisos.', 401);
    if (account.role !== 'transportista') throw new AuthError('Solo transportistas.', 403);
    const parsed = z.object({ ids: z.array(z.string().regex(/^[a-f0-9]{64}$/)).min(1).max(50) }).safeParse(await readAuthJson(request));
    if (!parsed.success) throw new AuthError('Selecciona de 1 a 50 avisos válidos.');
    const current = await carrierNotifications(account.id);
    const loadAlerts = await newLoadNotifications(account.id);
    const ids = [...new Set(parsed.data.ids)], readAt = new Date().toISOString();
    if (ids.some(id => !current.alerts.some(alert => alert.id === id) && !loadAlerts.some(alert => alert.id === id))) throw new AuthError('Los avisos cambiaron. Actualiza la lista.', 409);
    const docs = current.alerts.filter(alert => ids.includes(alert.id));
    const cargo = loadAlerts.filter(alert => ids.includes(alert.id));
    if (docs.length && cargo.length) await getDb().batch([
      getDb().insert(carrierNoticeReads).values(docs.map(alert => ({ id: alert.id, userId: account.id, documentId: alert.documentId, readAt }))).onConflictDoNothing(),
      getDb().insert(loadNoticeReads).values(cargo.map(alert => ({ id: alert.id, userId: account.id, loadId: alert.loadId, readAt }))).onConflictDoNothing()
    ]);
    else if (docs.length) await getDb().insert(carrierNoticeReads).values(docs.map(alert => ({ id: alert.id, userId: account.id, documentId: alert.documentId, readAt }))).onConflictDoNothing();
    else if (cargo.length) await getDb().insert(loadNoticeReads).values(cargo.map(alert => ({ id: alert.id, userId: account.id, loadId: alert.loadId, readAt }))).onConflictDoNothing();
    return responseJson({ saved: true });
  } catch (error) { return authFailure(error); }
}
