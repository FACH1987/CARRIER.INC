import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '../../../../../db';
import { loadPositions, loads } from '../../../../../db/schema';
import { AuthError, authFailure, currentAccount, readAuthJson, responseJson } from '../../../../../lib/account-auth';

export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ id: string }> };
const input = z.discriminatedUnion('action', [
  z.object({ action: z.literal('position'), latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180) }),
  z.object({ action: z.literal('stop') }),
]);

async function positionAccess(request: Request, context: Context) {
  const account = await currentAccount(request);
  if (!account) throw new AuthError('Inicia sesión.', 401);
  const { id } = await context.params;
  if (!z.string().uuid().safeParse(id).success) throw new AuthError('Carga no encontrada.', 404);
  const db = getDb();
  const [load] = await db.select().from(loads).where(eq(loads.id, id)).limit(1);
  if (!load || (load.ownerId !== `account:${account.id}` && load.carrierId !== account.id)) throw new AuthError('Carga no encontrada.', 404);
  if (!load.corporateExtras) throw new AuthError('El rastreo en vivo es para cargas de Corporativo.', 403);
  return { db, load, account };
}

export async function GET(request: Request, context: Context) {
  try {
    const { db, load, account } = await positionAccess(request, context);
    const [position] = load.status === 'en_transito'
      ? await db.select().from(loadPositions).where(eq(loadPositions.loadId, load.id)).limit(1)
      : [];
    const live = position && Date.now() - Date.parse(position.updatedAt) <= 60_000 ? position : null;
    return responseJson({ position: live, canShare: load.status === 'en_transito' && load.carrierId === account.id, inTransit: load.status === 'en_transito' });
  } catch (error) { return authFailure(error); }
}

export async function POST(request: Request, context: Context) {
  try {
    const { db, load, account } = await positionAccess(request, context);
    if (load.carrierId !== account.id) throw new AuthError('Solo el transportista asignado puede compartir su ubicación.', 403);
    const parsed = input.safeParse(await readAuthJson(request));
    if (!parsed.success) throw new AuthError('Ubicación inválida.');
    if (parsed.data.action === 'stop') {
      await db.delete(loadPositions).where(eq(loadPositions.loadId, load.id));
      return responseJson({ shared: false });
    }
    const { latitude, longitude } = parsed.data;
    const updatedAt = new Date().toISOString();
    const rows = await db.all<{ load_id: string }>(sql`
      INSERT INTO load_positions (load_id, latitude, longitude, updated_at)
      SELECT id, ${latitude}, ${longitude}, ${updatedAt}
      FROM loads WHERE id = ${load.id} AND carrier_id = ${account.id} AND status = 'en_transito' AND corporate_extras = 1
      ON CONFLICT (load_id) DO UPDATE SET latitude = excluded.latitude, longitude = excluded.longitude, updated_at = excluded.updated_at
      RETURNING load_id
    `);
    if (!rows.length) throw new AuthError('El viaje ya no está en tránsito.', 409);
    return responseJson({ shared: true });
  } catch (error) { return authFailure(error); }
}
