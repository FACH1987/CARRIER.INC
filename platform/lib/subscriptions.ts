import { env } from 'cloudflare:workers';
import { z } from 'zod';
import { and, desc, eq, gt, lte } from 'drizzle-orm';
import { getDb } from '../db';
import { subscriptionPayments } from '../db/schema';
import { dayInNicaragua } from './document-rules';

export const planIds = ['negocio', 'corporativo', 'chofer-pro', 'elite'] as const;
export const subscriptionPlans = {
  negocio: { name: 'Negocio', role: 'empresa', amountCents: 3000 },
  corporativo: { name: 'Corporativo', role: 'empresa', amountCents: 6800 },
  'chofer-pro': { name: 'Chofer Pro', role: 'transportista', amountCents: 2000 },
  elite: { name: 'Flota / Elite', role: 'transportista', amountCents: 4000 },
} as const;

export async function activePlan(userId: string, now = new Date().toISOString()) {
  const payments = subscriptionPayments;
  const [current] = await getDb().select({ plan: payments.plan }).from(payments)
    .where(and(eq(payments.userId, userId), lte(payments.startsAt, now), gt(payments.endsAt, now)))
    .orderBy(desc(payments.endsAt)).limit(1);
  return current?.plan ?? null;
}

export function nicaraguaMonthStart() {
  return dayInNicaragua().slice(0, 7) + '-01T06:00:00.000Z';
}

const receivingAccount = z.object({
  bank: z.string().trim().min(2).max(100),
  holder: z.string().trim().min(2).max(120),
  number: z.string().trim().regex(/^[A-Za-z0-9 -]{6,40}$/),
  type: z.enum(['ahorro', 'corriente']),
  currency: z.literal('USD'),
});

export function subscriptionReceivingAccount() {
  const value = (env as unknown as { SUBSCRIPTION_BANK_ACCOUNT?: string }).SUBSCRIPTION_BANK_ACCOUNT;
  if (!value) return null;
  try {
    const result = receivingAccount.safeParse(JSON.parse(value));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

export function oneMonthAfter(value: string) {
  const date = new Date(value);
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + 1);
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, lastDay));
  return date.toISOString();
}
