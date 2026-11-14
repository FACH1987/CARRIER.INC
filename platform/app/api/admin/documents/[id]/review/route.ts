import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '../../../../../../db';
import { carrierDocuments } from '../../../../../../db/schema';
import { currentAccount, readAuthJson, responseJson, AuthError, authFailure } from '../../../../../../lib/account-auth';
import { todayNI } from '../../../../../../lib/carrier-compliance';
export const dynamic = 'force-dynamic';
const schema = z.object({ revision: z.string().uuid(), status: z.enum(['approved', 'rejected']), note: z.string().trim().min(10).max(500), attest: z.literal(true) });
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const account = await currentAccount(request);
    if (!account) throw new AuthError('Inicia sesión.', 401);
    if (!account.isAdmin) throw new AuthError('Solo el administrador puede revisar documentos.', 403);
    const parsed = schema.safeParse(await readAuthJson(request));
    if (!parsed.success) throw new AuthError('Añade una observación y confirma la revisión.');
    const data = parsed.data, db = getDb();
    const [doc] = await db.select().from(carrierDocuments).where(eq(carrierDocuments.id, (await context.params).id));
    if (!doc) throw new AuthError('Documento no encontrado.', 404);
    if (doc.userId === account.id) throw new AuthError('No puedes aprobar tus propios documentos.', 403);
    if (data.status === 'approved' && !doc.exemption && !doc.noExpiry && (!doc.expiresAt || doc.expiresAt < todayNI())) throw new AuthError('No puedes aprobar un documento vencido.', 409);
    const result = await db.update(carrierDocuments).set({ status: data.status, reviewNote: data.note, reviewedBy: account.id, reviewedAt: new Date().toISOString() })
      .where(and(eq(carrierDocuments.id, doc.id), eq(carrierDocuments.revision, data.revision))).returning({ id: carrierDocuments.id });
    if (!result.length) throw new AuthError('El documento cambió. Actualiza antes de revisarlo.', 409);
    return responseJson({ saved: true });
  } catch (error) { return authFailure(error); }
}
