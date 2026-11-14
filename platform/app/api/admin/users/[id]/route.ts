import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '../../../../../db';
import { loads, sessions, users } from '../../../../../db/schema';
import { authFailure, currentAccount, requireSameOrigin, responseJson } from '../../../../../lib/account-auth';
import { withAdminAccess } from '../../../../../lib/admin-policy';
import { protectedFinancialHistory } from '../../../../../lib/billing';

export const dynamic = 'force-dynamic';
export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    requireSameOrigin(request);
    const account = await currentAccount(request);
    if (!account) return responseJson({ error: 'Inicia sesión para administrar usuarios.' }, 401);
    if (!account.isAdmin) return responseJson({ error: 'Solo el administrador puede eliminar usuarios.' }, 403);
    const id = (await context.params).id;
    if (!z.string().uuid().safeParse(id).success) return responseJson({ error: 'Usuario no encontrado.' }, 404);
    if (id === account.id || withAdminAccess({ id }).isAdmin) return responseJson({ error: 'La cuenta de administrador está protegida y no puede eliminarse.' }, 403);
    const db = getDb();
    const [target] = await db.select({ id: users.id }).from(users).where(eq(users.id, id)).limit(1);
    if (!target) return responseJson({ error: 'Usuario no encontrado.' }, 404);
    // D1 batch is transactional: remove the account, its sessions and its listings together.
    const guard = sql`not ${protectedFinancialHistory(id)}`;
    const result = await db.batch([
      db.delete(loads).where(and(eq(loads.ownerId, `account:${id}`), eq(loads.status, 'disponible'), guard)),
      db.delete(sessions).where(and(eq(sessions.userId, id), guard)),
      db.delete(users).where(and(eq(users.id, id), guard)).returning({ id: users.id })
    ]);
    if (!result[2].length) return responseJson({ error: 'La cuenta tiene cargas asignadas o comisiones. Se conserva para proteger el historial financiero.' }, 409);
    return responseJson({ deleted: true, id });
  } catch (error) { return authFailure(error); }
}
