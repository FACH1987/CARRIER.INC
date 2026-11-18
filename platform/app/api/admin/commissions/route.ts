import { and, count, desc, eq, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
import { getDb } from '../../../../db';
import { commissions, loads, users } from '../../../../db/schema';
import { authFailure, currentAccount, responseJson } from '../../../../lib/account-auth';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  try {
    const account = await currentAccount(request);
    if (!account) return responseJson({ error: 'Inicia sesión para acceder al panel.' }, 401);
    if (!account.isAdmin) return responseJson({ error: 'Solo el administrador puede consultar las comisiones.' }, 403);
    const params = new URL(request.url).searchParams;
    const status = params.get('status') || '';
    const query = (params.get('q') || '').trim().toLowerCase();
    const page = Number(params.get('page') || '1');
    if (!['', 'pending', 'paid'].includes(status) || query.length > 120 || !Number.isInteger(page) || page < 1 || page > 100000) return responseJson({ error: 'Revisa los filtros.' }, 400);
    const filter = and(status ? eq(commissions.status, status as 'pending' | 'paid') : undefined, query ? or(sql`instr(lower(${loads.company}), ${query}) > 0`, sql`instr(lower(${users.email}), ${query}) > 0`) : undefined);
    const db = getDb();
    const carrier = alias(users, 'carrier');
    const rows = await db.select({ id: commissions.id, loadId: commissions.loadId, company: loads.company, origin: loads.origin, destination: loads.destination,
      payerName: users.name, payerEmail: users.email, carrierName: carrier.name, fareCents: commissions.fareCents, rateBps: commissions.rateBps, amountCents: commissions.amountCents,
      status: commissions.status, createdAt: commissions.createdAt, paidAt: commissions.paidAt, paymentReference: commissions.paymentReference, currency: loads.currency })
      .from(commissions).innerJoin(loads, eq(commissions.loadId, loads.id)).innerJoin(users, eq(commissions.payerId, users.id)).innerJoin(carrier, eq(commissions.carrierId, carrier.id))
      .where(filter).orderBy(desc(commissions.createdAt), desc(commissions.id)).limit(25).offset((page - 1) * 25);
    const [matched] = await db.select({ total: count() }).from(commissions).innerJoin(loads, eq(commissions.loadId, loads.id)).innerJoin(users, eq(commissions.payerId, users.id)).where(filter);
    const byCurrency = await db.select({ currency: loads.currency, pendingCents: sql<number>`sum(case when ${commissions.status} = 'pending' then ${commissions.amountCents} else 0 end)`, paidCents: sql<number>`sum(case when ${commissions.status} = 'paid' then ${commissions.amountCents} else 0 end)`, count: count() })
      .from(commissions).innerJoin(loads, eq(commissions.loadId, loads.id)).groupBy(loads.currency);
    const totals = { byCurrency, count: byCurrency.reduce((total, row) => total + row.count, 0) };
    return responseJson({ commissions: rows, total: matched.total, page, pageSize: 25, totals });
  } catch (error) { return authFailure(error); }
}
