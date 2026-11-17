import { env } from 'cloudflare:workers';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { AuthError } from './account-auth';

function key() {
  const value = (env as unknown as { BANK_ACCOUNT_ENCRYPTION_KEY?: string }).BANK_ACCOUNT_ENCRYPTION_KEY || '';
  if (!/^[a-f0-9]{64}$/i.test(value)) throw new AuthError('El almacenamiento de cuentas bancarias está pendiente de configurar.', 503);
  return Buffer.from(value, 'hex');
}
export function encryptBankNumber(number: string, userId: string) {
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key(), iv);
  cipher.setAAD(Buffer.from(userId));
  const encrypted = Buffer.concat([cipher.update(number, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('hex'), cipher.getAuthTag().toString('hex'), encrypted.toString('hex')].join(':');
}
export function decryptBankNumber(value: string, userId: string) {
  try {
    const [version, iv, tag, encrypted] = value.split(':');
    if (version !== 'v1' || !/^[a-f0-9]{24}$/i.test(iv) || !/^[a-f0-9]{32}$/i.test(tag) || !/^(?:[a-f0-9]{2})+$/i.test(encrypted)) throw new Error('Invalid ciphertext');
    const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'hex'));
    decipher.setAAD(Buffer.from(userId));
    decipher.setAuthTag(Buffer.from(tag, 'hex'));
    return Buffer.concat([decipher.update(Buffer.from(encrypted, 'hex')), decipher.final()]).toString('utf8');
  } catch (error) {
    if (error instanceof AuthError) throw error;
    throw new AuthError('No se pudo leer la cuenta bancaria. Solicita una revisión al administrador.', 503);
  }
}
