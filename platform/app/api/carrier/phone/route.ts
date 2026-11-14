import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '../../../../db';
import { users } from '../../../../db/schema';
import { currentAccount, readAuthJson, responseJson, AuthError, authFailure, checkAuthLimit } from '../../../../lib/account-auth';
import { normalizePhone } from '../../../../lib/phone';
import { integrationStatus, twilioRequest } from '../../../../lib/mobile-providers';
export const dynamic = 'force-dynamic';
const schema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('save'), phone: z.string().max(30), channel: z.enum(['none', 'sms']), notifyLoads: z.boolean(), notifyDocuments: z.boolean(), consent: z.boolean() }),
  z.object({ action: z.literal('send_code') }),
  z.object({ action: z.literal('verify_code'), code: z.string().regex(/^\d{4,10}$/) })
]);
export async function GET(request: Request) {
  try {
    const account = await currentAccount(request);
    if (!account) throw new AuthError('Inicia sesión.', 401);
    if (account.role !== 'transportista') throw new AuthError('Solo transportistas.', 403);
    const [settings] = await getDb().select({ phone: users.phone, verifiedAt: users.phoneVerifiedAt, channel: users.phoneChannel, notifyLoads: users.notifyLoads, notifyDocuments: users.notifyDocuments, consentAt: users.phoneConsentAt }).from(users).where(eq(users.id, account.id));
    return responseJson({ settings, integrations: integrationStatus() });
  } catch (error) { return authFailure(error); }
}
export async function POST(request: Request) {
  try {
    const account = await currentAccount(request);
    if (!account) throw new AuthError('Inicia sesión.', 401);
    if (account.role !== 'transportista') throw new AuthError('Solo transportistas.', 403);
    const parsed = schema.safeParse(await readAuthJson(request));
    if (!parsed.success) throw new AuthError('Revisa el teléfono, las preferencias y el código.');
    const data = parsed.data, db = getDb();
    const [owner] = await db.select().from(users).where(eq(users.id, account.id));
    if (data.action === 'save') {
      const phone = normalizePhone(data.phone);
      if (!phone) throw new AuthError('Ingresa 8 dígitos de Nicaragua, con o sin +505.');
      if ((data.notifyLoads || data.notifyDocuments) && (!data.consent || data.channel !== 'sms')) throw new AuthError('Autoriza los avisos por SMS para activar estas preferencias.');
      await db.update(users).set({ phone, phoneVerifiedAt: owner.phone === phone ? owner.phoneVerifiedAt : null, phoneChannel: data.channel, notifyLoads: data.consent && data.channel === 'sms' && data.notifyLoads, notifyDocuments: data.consent && data.channel === 'sms' && data.notifyDocuments, phoneConsentAt: data.consent && data.channel === 'sms' ? owner.phone === phone && owner.phoneConsentAt ? owner.phoneConsentAt : new Date().toISOString() : null }).where(eq(users.id, account.id));
      return responseJson({ saved: true, verificationRequired: owner.phone !== phone || !owner.phoneVerifiedAt });
    }
    if (!owner.phone || owner.phoneChannel !== 'sms' || !owner.phoneConsentAt) throw new AuthError('Guarda tu número y autoriza los avisos por SMS primero.');
    if (!integrationStatus().phoneVerification) throw new AuthError('La confirmación por SMS todavía no está conectada. Tu número queda guardado, sin verificar y sin envíos activos.', 503);
    if (data.action === 'send_code') {
      await checkAuthLimit('phone-code', account.id, 3, 3600);
      await checkAuthLimit('phone-code-ip', request.headers.get('cf-connecting-ip') || 'unknown', 10, 3600);
      const result = await twilioRequest('Verifications', { To: owner.phone, Channel: 'sms', Locale: 'es' }, true);
      if (result.status !== 'pending') throw new AuthError('No pudimos iniciar la confirmación del teléfono.', 502);
      return responseJson({ codeRequested: true });
    }
    await checkAuthLimit('phone-code-check', account.id, 10, 900);
    const result = await twilioRequest('VerificationCheck', { To: owner.phone, Code: data.code }, true);
    if (result.status !== 'approved') throw new AuthError('El código no es válido o ya venció.');
    const updated = await db.update(users).set({ phoneVerifiedAt: new Date().toISOString() }).where(and(eq(users.id, account.id), eq(users.phone, owner.phone), eq(users.phoneChannel, 'sms'))).returning({ id: users.id });
    if (!updated.length) throw new AuthError('El número cambió. Solicita un código nuevo.', 409);
    return responseJson({ verified: true });
  } catch (error) { return authFailure(error); }
}
