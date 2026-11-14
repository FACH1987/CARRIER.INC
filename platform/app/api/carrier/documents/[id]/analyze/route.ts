import { Buffer } from 'node:buffer';
import { and, eq, notInArray } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '../../../../../../db';
import { carrierDocuments, carrierDrivers, carrierVehicles, carrierProfiles } from '../../../../../../db/schema';
import { currentAccount, readAuthJson, responseJson, AuthError, authFailure, checkAuthLimit } from '../../../../../../lib/account-auth';
import { documentBucket } from '../../../../../../lib/document-storage';
import { providerConfig, azureEndpoint } from '../../../../../../lib/mobile-providers';
import { readDocumentText } from '../../../../../../lib/document-reading';
export const dynamic = 'force-dynamic';
const schema = z.object({ action: z.enum(['start', 'poll']), consent: z.literal(true) });
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const account = await currentAccount(request);
    if (!account) throw new AuthError('Inicia sesión.', 401);
    const data = schema.safeParse(await readAuthJson(request));
    if (!data.success) throw new AuthError('Autoriza la lectura externa del documento.');
    const db = getDb();
    const [doc] = await db.select().from(carrierDocuments).where(eq(carrierDocuments.id, (await context.params).id));
    if (!doc || doc.userId !== account.id) throw new AuthError('Solo el titular puede autorizar la lectura externa de este documento.', 404);
    const c = providerConfig(), endpoint = azureEndpoint(c.OCR_AZURE_ENDPOINT || '');
    if (!endpoint || !c.OCR_AZURE_KEY) throw new AuthError('La lectura de PDF y fotos está pendiente de conectar Azure Document Intelligence. No se ha enviado el archivo a ningún proveedor.', 503);
    if (!doc.objectKey || doc.exemption) throw new AuthError('Este registro no contiene un archivo para leer.');
    const headers = { 'Ocp-Apim-Subscription-Key': c.OCR_AZURE_KEY };
    const modelPath = '/documentintelligence/documentModels/prebuilt-read';
    if (['starting', 'pending'].includes(doc.ocrStatus) && doc.ocrUpdatedAt && Date.now() - Date.parse(doc.ocrUpdatedAt) > 15 * 60000) {
      await db.update(carrierDocuments).set({ ocrStatus: 'failed', ocrOperationId: null }).where(and(eq(carrierDocuments.id, doc.id), eq(carrierDocuments.revision, doc.revision)));
      doc.ocrStatus = 'failed'; doc.ocrOperationId = null;
    }
    if (doc.ocrRevision === doc.revision && doc.ocrStatus === 'completed') return responseJson({ status: 'completed', summary: doc.ocrSummary ? JSON.parse(doc.ocrSummary) : null });
    if (data.data.action === 'start' && doc.ocrRevision === doc.revision && ['starting', 'pending'].includes(doc.ocrStatus)) return responseJson({ status: doc.ocrStatus });
    if (data.data.action === 'start') {
      await checkAuthLimit('document-reading', account.id, 10, 3600);
      const locked = await db.update(carrierDocuments).set({ ocrStatus: 'starting', ocrRevision: doc.revision, ocrOperationId: null, ocrSummary: null, ocrUpdatedAt: new Date().toISOString() }).where(and(eq(carrierDocuments.id, doc.id), eq(carrierDocuments.revision, doc.revision), notInArray(carrierDocuments.ocrStatus, ['starting', 'pending']))).returning({ id: carrierDocuments.id });
      if (!locked.length) throw new AuthError('El archivo cambió o ya se está leyendo. Actualiza el expediente.', 409);
      try {
        const object = await documentBucket().get(doc.objectKey);
        if (!object || object.size > 5 * 1024 * 1024) throw new AuthError('Archivo no disponible para lectura.', 409);
        const response = await fetch(endpoint + modelPath + ':analyze?api-version=2024-11-30&pages=1-5&locale=es', { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ base64Source: Buffer.from(await object.arrayBuffer()).toString('base64') }), signal: AbortSignal.timeout(20000), redirect: 'error' });
        if (!response.ok) throw new AuthError('El proveedor no aceptó la lectura. Revisa el servicio y el formato.', 502);
        const location = new URL(response.headers.get('operation-location') || '');
        const prefix = modelPath + '/analyzeResults/';
        const operationId = location.pathname.startsWith(prefix) ? location.pathname.slice(prefix.length) : '';
        if (location.origin !== endpoint || !z.string().uuid().safeParse(operationId).success) throw new AuthError('Respuesta de lectura no válida.', 502);
        await db.update(carrierDocuments).set({ ocrStatus: 'pending', ocrOperationId: operationId, ocrUpdatedAt: new Date().toISOString() }).where(and(eq(carrierDocuments.id, doc.id), eq(carrierDocuments.revision, doc.revision)));
        return responseJson({ status: 'pending' }, 202);
      } catch (error) {
        await db.update(carrierDocuments).set({ ocrStatus: 'failed', ocrOperationId: null, ocrUpdatedAt: new Date().toISOString() }).where(and(eq(carrierDocuments.id, doc.id), eq(carrierDocuments.revision, doc.revision)));
        if (error instanceof AuthError) throw error;
        throw new AuthError('No pudimos completar la solicitud de lectura. El archivo permanece privado y no se considera verificado.', 502);
      }
    }
    if (doc.ocrRevision !== doc.revision || !doc.ocrOperationId) throw new AuthError('Inicia primero la lectura de esta versión del archivo.', 409);
    await checkAuthLimit('document-reading-poll', account.id, 60, 60);
    const response = await fetch(endpoint + modelPath + '/analyzeResults/' + doc.ocrOperationId + '?api-version=2024-11-30', { headers, signal: AbortSignal.timeout(15000), redirect: 'error' });
    if (!response.ok) throw new AuthError('No pudimos consultar el resultado de lectura.', 502);
    const result = await response.json() as { status?: string; analyzeResult?: { content?: string } };
    if (result.status === 'failed') {
      await db.update(carrierDocuments).set({ ocrStatus: 'failed', ocrOperationId: null }).where(and(eq(carrierDocuments.id, doc.id), eq(carrierDocuments.revision, doc.revision)));
      throw new AuthError('El proveedor no pudo leer el archivo. Sube una copia más legible.', 422);
    }
    if (result.status !== 'succeeded') return responseJson({ status: 'pending' }, 202);
    const [driver] = doc.entityType === 'driver' ? await db.select().from(carrierDrivers).where(eq(carrierDrivers.id, doc.entityId)) : [];
    const [vehicle] = doc.entityType === 'vehicle' ? await db.select().from(carrierVehicles).where(eq(carrierVehicles.id, doc.entityId)) : [];
    const [profile] = doc.entityType === 'profile' ? await db.select().from(carrierProfiles).where(eq(carrierProfiles.userId, doc.userId)) : [];
    const summary = readDocumentText(result.analyzeResult?.content || '', { type: doc.type, issuedAt: doc.issuedAt, expiresAt: doc.expiresAt, noExpiry: doc.noExpiry, name: driver?.name || (profile?.kind === 'independiente' ? profile.legalName : null), plate: vehicle?.plate, categories: driver ? JSON.parse(driver.categories) : [] });
    const updated = await db.update(carrierDocuments).set({ ocrStatus: 'completed', ocrSummary: JSON.stringify(summary), ocrOperationId: null, ocrUpdatedAt: new Date().toISOString() }).where(and(eq(carrierDocuments.id, doc.id), eq(carrierDocuments.revision, doc.revision))).returning({ id: carrierDocuments.id });
    if (!updated.length) throw new AuthError('El archivo cambió durante la lectura. Analiza la versión actual.', 409);
    return responseJson({ status: 'completed', summary });
  } catch (error) { return authFailure(error); }
}
