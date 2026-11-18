import { and, eq, inArray, or } from 'drizzle-orm';
import { getDb } from '../db';
import { loadMessages, loadQuotes, users } from '../db/schema';

export async function loadChatParticipants(load: { id: string; carrierId: string | null }) {
  const db = getDb();
  const messages = db.select({ id: loadMessages.carrierId }).from(loadMessages).where(eq(loadMessages.loadId, load.id));
  const quotes = db.select({ id: loadQuotes.carrierId }).from(loadQuotes).where(eq(loadQuotes.loadId, load.id));
  const ids = messages.union(quotes);
  const participants = await db.select({ id: users.id, name: users.name }).from(users)
    .where(and(eq(users.role, 'transportista'), or(eq(users.id, load.carrierId || ''),
      // Quienes escribieron o cotizaron son candidatos, aunque aún no tengan asignación.
      inArray(users.id, ids))))
    .orderBy(users.name).limit(100);
  return participants.map(user => ({ ...user, name: chatPublicName(user.name, 'Transportista') }));
}

export function containsExternalContact(message: string) {
  const text = message.normalize('NFKC').replace(/[\p{Cf}\p{M}]/gu, '').replace(/\b\d{4}-\d{2}-\d{2}\b/g, '');
  return /\p{Nd}(?:[\s().+\-/]*\p{Nd}){7,}/u.test(text)
    || /@|\b(?:https?:\/\/|www\.|wa\.me\b|t\.me\b|api\.whatsapp\.com\b)/i.test(text);
}

export function chatPublicName(value: string, fallback: string) {
  return containsExternalContact(value) ? fallback : value;
}
