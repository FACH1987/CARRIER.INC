import { env } from 'cloudflare:workers';
import { AuthError } from './account-auth';
export function documentBucket() {
  const bucket = (env as unknown as { DOCUMENTS?: R2Bucket }).DOCUMENTS;
  if (!bucket) throw new AuthError('El almacenamiento privado de documentos no está disponible.', 503);
  return bucket;
}
export async function limitedBody(request: Request, max: number) {
  if (Number(request.headers.get('content-length') || 0) > max) throw new AuthError('El archivo supera el límite de 5 MB.', 413);
  const reader = request.body?.getReader();
  if (!reader) throw new AuthError('Selecciona un documento.');
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const item = await reader.read(); if (item.done) break;
      size += item.value.byteLength;
      if (size > max) { await reader.cancel(); throw new AuthError('El archivo supera el límite de 5 MB.', 413); }
      chunks.push(item.value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}
