import { createHash, timingSafeEqual } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { and, asc, eq, gt, isNotNull, ne } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '../../../../db';
import { users, phoneDeliveries } from '../../../../db/schema';
import { responseJson, AuthError, authFailure } from '../../../../lib/account-auth';
import { providerConfig, integrationStatus, twilioRequest } from '../../../../lib/mobile-providers';
import { carrierNotifications } from '../../../../lib/carrier-notifications';
import { newLoadNotifications } from '../../../../lib/load-notifications';
import { adminAccountId } from '../../../../lib/admin-policy';
export const dynamic = 'force-dynamic';
function authorized(request: Request) {
  const expected = providerConfig().MOBILE_JOB_TOKEN;
  const token = request.headers.get('authorization')?.replace(/^Bearer /, '') || '';
  const supplied = Buffer.from(token), secret = Buffer.from(expected || '');
  return Boolean(expected && expected.length >= 32 && supplied.length === secret.length && timingSafeEqual(supplied, secret));
}
export async function POST(request: Request) {
  try {
    if (!authorized(request)) return responseJson({ error: 'No encontrado.' }, 404);
    if (!integrationStatus().sms) throw new AuthError('El envío SMS no está configurado.', 503);
    const cursor = new URL(request.url).searchParams.get('cursor');
    if (cursor && !z.string().uuid().safeParse(cursor).success) throw new AuthError('Cursor inválido.');
    const db = getDb();
    const recipients = await db.select().from(users).where(and(ne(users.id, adminAccountId()), eq(users.role, 'transportista'), eq(users.phoneChannel, 'sms'), isNotNull(users.phone), isNotNull(users.phoneVerifiedAt), isNotNull(users.phoneConsentAt), cursor ? gt(users.id, cursor) : undefined)).orderBy(asc(users.id)).limit(3);
    let accepted = 0, failed = 0, skipped = 0;
    const site = new URL(request.url).origin;
    for (const recipient of recipients) {
      const documents = recipient.notifyDocuments ? (await carrierNotifications(recipient.id)).alerts.map(alert => ({ eventType: 'document', eventId: alert.id, message: `Carrier.INC: ${alert.title}. ${alert.subject}. Vence: ${alert.expiresAt}. ${alert.message} Renueva: ${site}/carrier.html` })) : [];
      const loads = recipient.notifyLoads ? (await newLoadNotifications(recipient.id)).map(alert => ({ eventType: 'load', eventId: alert.loadId, message: `Carrier.INC: ${alert.title}. ${alert.subject}. ${alert.message} Ver carga: ${site}/market.html#tablero` })) : [];
      const previous = new Set((await db.select({ id: phoneDeliveries.id }).from(phoneDeliveries).where(eq(phoneDeliveries.userId, recipient.id))).map(row => row.id));
      let attempts = 0;
      for (const event of [...documents, ...loads]) {
        const id = createHash('sha256').update([recipient.id, recipient.phone, 'sms', event.eventType, event.eventId].join(':')).digest('hex');
        if (previous.has(id)) { skipped++; continue; }
        if (attempts >= 3) break;
        // Re-read opt-in and ownership before each send so changes take effect promptly.
        const [current] = await db.select().from(users).where(eq(users.id, recipient.id));
        if (!current || !current.phoneVerifiedAt || !current.phoneConsentAt || current.phone !== recipient.phone || current.phoneChannel !== 'sms' || !(event.eventType === 'load' ? current.notifyLoads : current.notifyDocuments)) { skipped++; continue; }
        const now = new Date().toISOString();
        await db.insert(phoneDeliveries).values({ id, userId: recipient.id, eventType: event.eventType, eventId: event.eventId, channel: 'sms', phone: recipient.phone!, state: 'pending', createdAt: now, updatedAt: now }).onConflictDoNothing();
        const claimed = await db.update(phoneDeliveries).set({ state: 'sending', updatedAt: now }).where(and(eq(phoneDeliveries.id, id), eq(phoneDeliveries.state, 'pending'))).returning({ id: phoneDeliveries.id });
        if (!claimed.length) { skipped++; continue; }
        attempts++;
        try {
          const result = await twilioRequest('Messages', { To: recipient.phone!, From: providerConfig().TWILIO_SMS_FROM!, Body: event.message });
          if (!/^SM[a-f0-9]{32}$/i.test(result.sid || '')) throw new AuthError('Respuesta SMS no válida.', 502);
          await db.update(phoneDeliveries).set({ state: 'provider_accepted', providerId: result.sid, updatedAt: new Date().toISOString() }).where(eq(phoneDeliveries.id, id));
          accepted++;
        } catch {
          // Do not retry uncertain submissions automatically: this avoids duplicate SMS.
          await db.update(phoneDeliveries).set({ state: 'needs_review', updatedAt: new Date().toISOString() }).where(eq(phoneDeliveries.id, id));
          failed++;
        }
      }
    }
    return responseJson({ acceptedByProvider: accepted, needsReview: failed, skipped, nextCursor: recipients.length === 3 ? recipients.at(-1)!.id : null, deliveryConfirmed: false });
  } catch (error) { return authFailure(error); }
}
