import { and, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '../../../../../db';
import { loadPositions, loads } from '../../../../../db/schema';
import { usesSupabase } from '../../../../../db/supabase';
import { AuthError, authFailure, currentAccount, requireSameOrigin, responseJson } from '../../../../../lib/account-auth';
import { documentBucket, limitedBody } from '../../../../../lib/document-storage';

export const dynamic = 'force-dynamic';
const maxPhotoBytes = 5 * 1024 * 1024;
const photoNames = ['receipt', 'cargo'] as const;
type Context = { params: Promise<{ id: string }> };

async function loadAccess(request: Request, context: Context) {
  const account = await currentAccount(request);
  if (!account) throw new AuthError('Inicia sesión para acceder a la entrega.', 401);
  if (account.role === 'administrador') throw new AuthError('La cuenta de administrador no opera fletes.', 403);
  if (usesSupabase()) throw new AuthError('El expediente de entrega requiere D1.', 503);
  const { id } = await context.params;
  if (!z.string().uuid().safeParse(id).success) throw new AuthError('Carga no encontrada.', 404);
  const db = getDb();
  const [load] = await db.select().from(loads).where(eq(loads.id, id)).limit(1);
  if (!load) throw new AuthError('Carga no encontrada.', 404);
  return { db, load, owner: load.ownerId === `account:${account.id}`, carrier: load.carrierId === account.id };
}

async function readPhoto(value: FormDataEntryValue | null) {
  if (!(value instanceof File) || !value.size) throw new AuthError('Adjunta las dos fotos de la entrega.');
  if (value.size > maxPhotoBytes) throw new AuthError('Cada foto puede pesar hasta 5 MB.', 413);
  const buffer = await value.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const jpeg = value.type === 'image/jpeg' && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  const png = value.type === 'image/png' && [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => bytes[index] === byte);
  if (!jpeg && !png) throw new AuthError('Las fotos deben estar en formato JPG o PNG.', 415);
  return { buffer, type: value.type };
}

function evidenceKey(loadId: string, evidenceId: string, photo: string) {
  return `delivery-evidence/${loadId}/${evidenceId}/${photo}`;
}

export async function POST(request: Request, context: Context) {
  try {
    requireSameOrigin(request);
    const { db, load, carrier } = await loadAccess(request, context);
    if (!carrier) throw new AuthError('Solo el transportista asignado puede adjuntar las fotos.', 403);
    if (!['en_transito', 'entregada'].includes(load.status) || load.deliveryEvidenceId)
      throw new AuthError('Esta carga no admite nuevas fotos de entrega.', 409);
    const contentType = request.headers.get('content-type') || '';
    if (!contentType.startsWith('multipart/form-data;')) throw new AuthError('Adjunta las dos fotos.', 415);
    const bytes = await limitedBody(request, 3 * maxPhotoBytes + 64 * 1024);
    const form = await new Response(new Uint8Array(bytes), { headers: { 'Content-Type': contentType } })
      .formData().catch(() => { throw new AuthError('No se pudieron leer las fotos.'); });
    const photos = await Promise.all(photoNames.map(name => readPhoto(form.get(name))));
    const signer = typeof form.get('signer') === 'string' ? String(form.get('signer')).trim() : '';
    const signature = form.get('signature');
    if ((signer || signature) && (!load.corporateExtras || signer.length < 2 || signer.length > 120 || form.get('signatureConsent') !== 'true'))
      throw new AuthError('Para adjuntar la firma, indica el nombre del receptor y registra su autorización.');
    const attached = [...photoNames] as string[];
    if (signer || signature) {
      photos.push(await readPhoto(signature));
      attached.push('signature');
    }
    const evidenceId = crypto.randomUUID();
    const bucket = documentBucket();
    const keys = attached.map(name => evidenceKey(load.id, evidenceId, name));
    try {
      for (const [index, photo] of photos.entries()) {
        await bucket.put(keys[index], photo.buffer, { httpMetadata: { contentType: photo.type } });
      }
    } catch (error) {
      await bucket.delete(keys).catch(() => {});
      throw error;
    }
    const updated = await db.update(loads).set({
      status: 'entregada',
      deliveredAt: load.deliveredAt || new Date().toISOString(),
      deliveryEvidenceId: evidenceId,
      deliverySigner: signer || null,
    }).where(and(eq(loads.id, load.id), eq(loads.status, load.status),
      eq(loads.carrierId, load.carrierId!), isNull(loads.deliveryEvidenceId))).returning({ id: loads.id });
    if (!updated.length) {
      await bucket.delete(keys).catch(() => {});
      throw new AuthError('La carga cambió. Actualiza el tablero.', 409);
    }
    await db.delete(loadPositions).where(eq(loadPositions.loadId, load.id));
    return responseJson({ status: 'entregada' });
  } catch (error) { return authFailure(error); }
}

export async function GET(request: Request, context: Context) {
  try {
    const { load, owner, carrier } = await loadAccess(request, context);
    if (!owner && !carrier) throw new AuthError('No tienes acceso a estas fotos.', 403);
    const photo = new URL(request.url).searchParams.get('photo');
    if ((photo !== 'receipt' && photo !== 'cargo' && !(photo === 'signature' && load.deliverySigner)) || !load.deliveryEvidenceId)
      throw new AuthError('Foto no encontrada.', 404);
    const object = await documentBucket().get(evidenceKey(load.id, load.deliveryEvidenceId, photo));
    if (!object) throw new AuthError('Foto no encontrada.', 404);
    return new Response(object.body, { headers: {
      'Content-Type': object.httpMetadata?.contentType ?? 'application/octet-stream',
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    } });
  } catch (error) { return authFailure(error); }
}
