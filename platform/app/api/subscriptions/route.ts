import { and, asc, desc, eq, gt, isNull, lte } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '../../../db';
import { subscriptionPayments, users } from '../../../db/schema';
import { AuthError, authFailure, currentAccount, readAuthJson, responseJson } from '../../../lib/account-auth';
import { oneMonthAfter, planIds, subscriptionPlans, subscriptionReceivingAccount } from '../../../lib/subscriptions';

export const dynamic = 'force-dynamic';
const actions = z.discriminatedUnion('action', [
  z.object({ action: z.literal('request'), plan: z.enum(planIds) }),
  z.object({ action: z.literal('verify'), reference: z.string().uuid(),
    bankReference: z.string().trim().min(3).max(120).transform(value => value.toUpperCase()),
    amountCents: z.number().int().positive(), currency: z.literal('USD') }),
]);
const payments = subscriptionPayments;

export async function GET(request: Request) {
  try {
    const account = await currentAccount(request);
    if (!account) throw new AuthError('Inicia sesión para consultar las suscripciones.', 401);
    const db = getDb();
    if (account.isAdmin) {
      const rows = await db.select({ reference: payments.reference, plan: payments.plan, amountCents: payments.amountCents,
        createdAt: payments.createdAt, name: users.name, email: users.email })
        .from(payments).innerJoin(users, eq(payments.userId, users.id)).where(isNull(payments.verifiedAt))
        .orderBy(asc(payments.createdAt)).limit(100);
      return responseJson({ admin: true, pending: rows, configured: Boolean(subscriptionReceivingAccount()) });
    }
    const now = new Date().toISOString();
    const [active] = await db.select().from(payments).where(and(eq(payments.userId, account.id),
      lte(payments.startsAt, now), gt(payments.endsAt, now))).orderBy(desc(payments.endsAt)).limit(1);
    const [upcoming] = await db.select().from(payments).where(and(eq(payments.userId, account.id),
      gt(payments.startsAt, now))).orderBy(asc(payments.startsAt)).limit(1);
    const [pending] = await db.select().from(payments).where(and(eq(payments.userId, account.id), isNull(payments.verifiedAt)));
    const period = (row: typeof active) => row ? { plan: row.plan, startsAt: row.startsAt, endsAt: row.endsAt } : null;
    const bank = subscriptionReceivingAccount();
    return responseJson({ role: account.role, plans: Object.entries(subscriptionPlans).filter(([, plan]) => plan.role === account.role),
      active: period(active), upcoming: period(upcoming), configured: Boolean(bank),
      pending: pending ? { reference: pending.reference, plan: pending.plan, amountCents: pending.amountCents, bank } : null });
  } catch (error) { return authFailure(error); }
}

export async function POST(request: Request) {
  try {
    const account = await currentAccount(request);
    if (!account) throw new AuthError('Inicia sesión para gestionar la suscripción.', 401);
    const result = actions.safeParse(await readAuthJson(request));
    if (!result.success) throw new AuthError('Revisa el plan o los datos del abono.');
    const data = result.data;
    const db = getDb();
    const now = new Date().toISOString();
    if (data.action === 'request') {
      const plan = subscriptionPlans[data.plan];
      if (account.role !== plan.role) throw new AuthError('Este plan corresponde a otro tipo de cuenta.', 403);
      if (!subscriptionReceivingAccount()) throw new AuthError('Los datos de pago de Carrier.INC aún no están disponibles.', 503);
      const [upcoming] = await db.select({ reference: payments.reference }).from(payments)
        .where(and(eq(payments.userId, account.id), gt(payments.startsAt, now))).limit(1);
      if (upcoming) throw new AuthError('Ya tienes una mensualidad futura verificada.', 409);
      await db.insert(payments).values({ reference: crypto.randomUUID(), userId: account.id, plan: data.plan,
        amountCents: plan.amountCents, createdAt: now }).onConflictDoNothing();
      const [pending] = await db.select({ reference: payments.reference, plan: payments.plan }).from(payments)
        .where(and(eq(payments.userId, account.id), isNull(payments.verifiedAt))).limit(1);
      if (!pending || pending.plan !== data.plan) throw new AuthError('Ya tienes otra solicitud en trámite.', 409);
      return responseJson(pending);
    }
    if (!account.isAdmin) throw new AuthError('Solo el administrador puede verificar los abonos.', 403);
    const [payment] = await db.select().from(payments).where(eq(payments.reference, data.reference)).limit(1);
    if (!payment) throw new AuthError('No encontramos la mensualidad.', 404);
    if (payment.verifiedAt) {
      if (payment.bankReference === data.bankReference && payment.amountCents === data.amountCents) return responseJson({ verified: true });
      throw new AuthError('Esta mensualidad ya fue verificada.', 409);
    }
    if (payment.amountCents !== data.amountCents) throw new AuthError('El importe del abono debe coincidir con el del plan.', 409);
    const [previous] = await db.select({ endsAt: payments.endsAt }).from(payments)
      .where(and(eq(payments.userId, payment.userId), gt(payments.endsAt, now))).orderBy(desc(payments.endsAt)).limit(1);
    const startsAt = previous?.endsAt || now;
    const endsAt = oneMonthAfter(startsAt);
    let updated;
    try {
      updated = await db.update(payments).set({ verifiedAt: now, verifiedBy: account.id,
        bankReference: data.bankReference, startsAt, endsAt })
        .where(and(eq(payments.reference, data.reference), isNull(payments.verifiedAt))).returning({ reference: payments.reference });
    } catch (error) {
      const [duplicate] = await db.select({ reference: payments.reference }).from(payments).where(eq(payments.bankReference, data.bankReference));
      if (duplicate?.reference === data.reference) return responseJson({ verified: true });
      if (duplicate) throw new AuthError('Este abono bancario ya se usó para otra mensualidad.', 409);
      throw error;
    }
    if (!updated.length) throw new AuthError('La mensualidad cambió. Actualiza el panel.', 409);
    return responseJson({ verified: true, startsAt, endsAt });
  } catch (error) { return authFailure(error); }
}
