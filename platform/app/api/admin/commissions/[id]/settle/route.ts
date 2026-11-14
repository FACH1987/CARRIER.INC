import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '../../../../../../db';
import { commissions } from '../../../../../../db/schema';
import { AuthError, authFailure, currentAccount, readAuthJson, responseJson } from '../../../../../../lib/account-auth';
export const dynamic = 'force-dynamic';
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const data = z.object({ reference: z.string().trim().min(3).max(120), confirmReceived: z.literal(true) }).safeParse(await readAuthJson(request));
    if (!data.success) throw new AuthError('Escribe la referencia del pago recibido (3 a 120 caracteres).');
    const account = await currentAccount(request);
    if (!account) throw new AuthError('Inicia sesión para registrar el cobro.', 401);
    if (!account.isAdmin) throw new AuthError('Solo el administrador puede registrar pagos recibidos.', 403);
    const id = (await context.params).id;
    if (!z.string().uuid().safeParse(id).success) throw new AuthError('Comisión no encontrada.', 404);
    const db = getDb();
    const [existing] = await db.select({ status: commissions.status }).from(commissions).where(eq(commissions.id, id)).limit(1);
    if (!existing) throw new AuthError('Comisión no encontrada.', 404);
    if (existing.status === 'paid') throw new AuthError('Esta comisión ya tiene un pago registrado. No se modificó el registro.', 409);
    const changed = await db.update(commissions).set({ status: 'paid', paidAt: new Date().toISOString(), paymentReference: data.data.reference, recordedBy: account.id })
      .where(and(eq(commissions.id, id), eq(commissions.status, 'pending'))).returning({ id: commissions.id });
    if (!changed.length) throw new AuthError('El estado de la comisión cambió. Actualiza el panel.', 409);
    return responseJson({ paid: true, id });
  } catch (error) { return authFailure(error); }
}
