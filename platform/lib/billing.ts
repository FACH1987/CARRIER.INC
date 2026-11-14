import { sql, type SQLWrapper } from 'drizzle-orm';
export const COMMISSION_RATE_BPS = 1000;
export function freightQuote(pay: number, rateBps = COMMISSION_RATE_BPS) {
  const fareCents = Math.round(pay * 100);
  if (!Number.isSafeInteger(fareCents) || fareCents < 100 || fareCents > 100000000 || !Number.isInteger(rateBps) || rateBps < 0 || rateBps > 10000) throw new Error('Importe no válido.');
  const commissionCents = Math.round(fareCents * rateBps / 10000);
  return { fareCents, rateBps, commissionCents, totalCents: fareCents + commissionCents };
}
export function protectedFinancialHistory(id: string | SQLWrapper) {
  return sql<boolean>`(exists (select 1 from loads where status <> 'disponible' and (owner_id = 'account:' || ${id} or carrier_id = ${id})) or exists (select 1 from commissions where payer_id = ${id} or carrier_id = ${id} or recorded_by = ${id}))`;
}
