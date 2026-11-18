import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '../../../../../db';
import { carrierRatings, loads } from '../../../../../db/schema';
import { AuthError, authFailure, currentAccount, readAuthJson, responseJson } from '../../../../../lib/account-auth';

export const dynamic = 'force-dynamic';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const account = await currentAccount(request);
    if (!account) throw new AuthError('Inicia sesión.', 401);
    const { id } = await context.params;
    if (!z.string().uuid().safeParse(id).success) throw new AuthError('Carga no encontrada.', 404);
    const data = z.object({ score: z.number().int().min(1).max(5) }).safeParse(await readAuthJson(request));
    if (!data.success) throw new AuthError('Selecciona una calificación de 1 a 5.');
    const db = getDb();
    const [load] = await db.select({ carrierId: loads.carrierId }).from(loads).where(and(
      eq(loads.id, id), eq(loads.ownerId, `account:${account.id}`), eq(loads.status, 'finalizada'),
    )).limit(1);
    if (!load?.carrierId) throw new AuthError('Solo quien publicó la carga puede calificar el flete finalizado.', 403);
    const [saved] = await db.insert(carrierRatings).values({
      loadId: id, carrierId: load.carrierId, score: data.data.score, createdAt: new Date().toISOString(),
    }).onConflictDoNothing().returning({ score: carrierRatings.score });
    if (!saved) throw new AuthError('Ya calificaste a este transportista para la carga.', 409);
    return responseJson(saved, 201);
  } catch (error) { return authFailure(error); }
}
