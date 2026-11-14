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
      .where(and(eq(loads.id, id), eq(loads.ownerId, owner))).returning({ id: loads.id });
    if (removed.length === 0) return responseJson({ error: 'La carga no existe o no pertenece a tu cuenta.' }, 404);
    return responseJson({ deleted: true, id });
  } catch (error) { return authFailure(error); }
}
