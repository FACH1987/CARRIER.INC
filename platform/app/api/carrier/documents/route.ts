import { and, eq } from 'drizzle-orm';
import { getDb } from '../../../../db';
import { carrierProfiles, carrierDrivers, carrierVehicles, carrierDocuments } from '../../../../db/schema';
import { AuthError, authFailure, currentAccount, requireSameOrigin, responseJson, checkAuthLimit } from '../../../../lib/account-auth';
import { requirements, exemptable, timeless, todayNI, validDate } from '../../../../lib/carrier-compliance';
import { documentBucket, limitedBody } from '../../../../lib/document-storage';
export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const account = await currentAccount(request);
    if (!account) throw new AuthError('Inicia sesión.', 401);
    if (account.role !== 'transportista') throw new AuthError('Solo transportistas.', 403);
    await checkAuthLimit('document-upload', account.id, 100, 3600);
    let params: URLSearchParams;
    try { params = new URLSearchParams(decodeURIComponent(request.headers.get('X-Document-Metadata') || '')); } catch { throw new AuthError('Metadatos inválidos.'); }
    const entityType = params.get('entityType') as 'profile' | 'driver' | 'vehicle';
    const entityId = params.get('entityId') || '', type = params.get('type') || '';
    if (!['profile', 'driver', 'vehicle'].includes(entityType) || ![...requirements[entityType], ...(entityType === 'vehicle' ? ['special_permit'] : [])].includes(type)) throw new AuthError('Tipo de documento inválido.');
    const db = getDb();
    const entity = entityType === 'profile' ? await db.select({ id: carrierProfiles.userId }).from(carrierProfiles).where(and(eq(carrierProfiles.userId, account.id), eq(carrierProfiles.userId, entityId))) : entityType === 'driver' ? await db.select({ id: carrierDrivers.id }).from(carrierDrivers).where(and(eq(carrierDrivers.userId, account.id), eq(carrierDrivers.id, entityId))) : await db.select({ id: carrierVehicles.id }).from(carrierVehicles).where(and(eq(carrierVehicles.userId, account.id), eq(carrierVehicles.id, entityId)));
    if (!entity.length) throw new AuthError('Registro no encontrado.', 404);
    const issuedAt = params.get('issuedAt'), expiresAt = params.get('expiresAt');
    const noExpiry = params.get('noExpiry') === 'true', exemption = params.get('exemption')?.trim() || null;
    if (exemption) {
      if (!exemptable.includes(type) || exemption.length < 15 || exemption.length > 500) throw new AuthError('Explica por qué no aplica este documento (15 a 500 caracteres).');
    } else {
      if (!issuedAt || !validDate(issuedAt) || issuedAt > todayNI()) throw new AuthError('La emisión debe ser una fecha válida, no futura.');
      if (noExpiry && !timeless.includes(type)) throw new AuthError('Este documento requiere vencimiento.');
      if (!noExpiry && (!expiresAt || !validDate(expiresAt) || expiresAt < todayNI() || expiresAt < issuedAt)) throw new AuthError('El documento debe estar vigente y vencer después de su emisión.');
    }
    const bytes = await limitedBody(request, 5 * 1024 * 1024);
    const mime = request.headers.get('content-type')?.split(';')[0];
    if (!exemption) {
      const pdf = mime === 'application/pdf' && new TextDecoder().decode(bytes.slice(0, 5)) === '%PDF-';
      const png = mime === 'image/png' && [137, 80, 78, 71, 13, 10, 26, 10].every((n, i) => bytes[i] === n);
      const jpeg = mime === 'image/jpeg' && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
      if (bytes.length < 16 || !(pdf || png || jpeg)) throw new AuthError('Sube un PDF, JPG o PNG válido. Máximo 5 MB.');
    }
    const [old] = await db.select().from(carrierDocuments).where(and(eq(carrierDocuments.userId, account.id), eq(carrierDocuments.entityType, entityType), eq(carrierDocuments.entityId, entityId), eq(carrierDocuments.type, type)));
    const revision = crypto.randomUUID(), id = old?.id || crypto.randomUUID();
    const bucket = documentBucket();
    const objectKey = exemption ? null : `${account.id}/${revision}`;
    if (objectKey) await bucket.put(objectKey, bytes, { httpMetadata: { contentType: mime! } });
    const record = { userId: account.id, entityType, entityId, type, objectKey, mime: exemption ? null : mime!, size: exemption ? 0 : bytes.length, issuedAt: exemption ? null : issuedAt, expiresAt: exemption || noExpiry ? null : expiresAt, noExpiry: !exemption && noExpiry, exemption, status: 'pending' as const, revision, uploadedAt: new Date().toISOString(), reviewedAt: null, reviewedBy: null, reviewNote: null };
    try {
      await db.insert(carrierDocuments).values({ id, ...record }).onConflictDoUpdate({ target: [carrierDocuments.userId, carrierDocuments.entityType, carrierDocuments.entityId, carrierDocuments.type], set: record });
    } catch (error) { if (objectKey) await bucket.delete(objectKey); throw error; }
    // A current replacement qualifies immediately; optional prior review is cleared.
    if (old?.objectKey) await bucket.delete(old.objectKey).catch(() => undefined);
    return responseJson({ saved: true, id, status: 'pending' }, 201);
  } catch (error) { return authFailure(error); }
}
