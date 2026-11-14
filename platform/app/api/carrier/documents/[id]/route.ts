import { eq } from 'drizzle-orm';
import { getDb } from '../../../../../db';
import { carrierDocuments } from '../../../../../db/schema';
import { currentAccount, AuthError, authFailure } from '../../../../../lib/account-auth';
import { documentBucket } from '../../../../../lib/document-storage';
export const dynamic = 'force-dynamic';
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const account = await currentAccount(request);
    if (!account) throw new AuthError('Inicia sesión.', 401);
    const [doc] = await getDb().select().from(carrierDocuments).where(eq(carrierDocuments.id, (await context.params).id));
    if (!doc || (!account.isAdmin && doc.userId !== account.id)) throw new AuthError('Documento no encontrado.', 404);
    if (!doc.objectKey) throw new AuthError('Este registro no tiene archivo.', 404);
    const object = await documentBucket().get(doc.objectKey);
    if (!object) throw new AuthError('Archivo no disponible. Solicita una nueva carga.', 404);
    const extension = doc.mime === 'application/pdf' ? 'pdf' : doc.mime === 'image/png' ? 'png' : 'jpg';
    return new Response(object.body, { headers: { 'Content-Type': doc.mime!, 'Content-Disposition': `attachment; filename="documento-${doc.id}.${extension}"`, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; sandbox", 'Referrer-Policy': 'no-referrer', Vary: 'Cookie' } });
  } catch (error) { return authFailure(error); }
}
