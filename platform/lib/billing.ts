import { sql, type SQLWrapper } from 'drizzle-orm';
export function freightCents(pay: number) {
  const fareCents = Math.round(pay * 100);
  if (!Number.isSafeInteger(fareCents) || fareCents < 100 || fareCents > 100000000) throw new Error('Importe no válido.');
  return fareCents;
}
export function protectedFinancialHistory(id: string | SQLWrapper) {
  return sql<boolean>`(exists (select 1 from loads where status <> 'disponible' and (owner_id = 'account:' || ${id} or carrier_id = ${id})) or exists (select 1 from commissions where payer_id = ${id} or carrier_id = ${id} or recorded_by = ${id}))`;
}
