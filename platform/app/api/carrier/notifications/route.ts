import { z } from 'zod';
import { getDb } from '../../../../db';
import { carrierNoticeReads } from '../../../../db/schema';
import { currentAccount, readAuthJson, responseJson, AuthError, authFailure } from '../../../../lib/account-auth';
import { carrierNotifications } from '../../../../lib/carrier-notifications';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  try {
    const account = await currentAccount(request);
    if (!account) throw new AuthError('Inicia sesión para ver tus avisos.', 401);
    if (account.role !== 'transportista') throw new AuthError('Solo transportistas.', 403);
    return responseJson(await carrierNotifications(account.id));
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
    const selected = [...new Set(parsed.data.ids)].map(id => current.alerts.find(alert => alert.id === id));
    if (selected.some(alert => !alert)) throw new AuthError('Los avisos cambiaron. Actualiza la lista.', 409);
    await getDb().insert(carrierNoticeReads).values(selected.map(alert => ({ id: alert!.id, userId: account.id, documentId: alert!.documentId, readAt: new Date().toISOString() }))).onConflictDoNothing();
    return responseJson({ saved: true });
  } catch (error) { return authFailure(error); }
}
