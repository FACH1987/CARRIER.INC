import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '../../../../db';
import { loads } from '../../../../db/schema';
import { deleteSupabaseLoad, usesSupabase } from '../../../../db/supabase';
import { authFailure, currentAccount, requireSameOrigin, responseJson } from '../../../../lib/account-auth';

export const dynamic = 'force-dynamic';
export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    requireSameOrigin(request);
    const user = await currentAccount(request);
    if (!user) return responseJson({ error: 'Inicia sesión para eliminar tus cargas.' }, 401);
    const id = (await context.params).id;
    if (!z.string().uuid().safeParse(id).success) return responseJson({ error: 'Carga no encontrada.' }, 404);
    const owner = `account:${user.id}`;
    const removed = usesSupabase() ? await deleteSupabaseLoad(id, owner) : await getDb().delete(loads)
      .where(and(eq(loads.id, id), eq(loads.ownerId, owner), eq(loads.status, 'disponible'))).returning({ id: loads.id });
    if (removed.length === 0) {
      const [owned] = await getDb().select({ id: loads.id }).from(loads).where(and(eq(loads.id, id), eq(loads.ownerId, owner))).limit(1);
      return responseJson({ error: owned ? 'Una carga asignada o finalizada no se elimina para conservar su historial y comisiones.' : 'La carga no existe o no pertenece a tu cuenta.' }, owned ? 409 : 404);
    }
    return responseJson({ deleted: true, id });
  } catch (error) { return authFailure(error); }
}
