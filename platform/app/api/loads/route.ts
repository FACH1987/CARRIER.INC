import { usesSupabase } from '../../../db/supabase';
import { getDb } from '../../../db';
import { commissions, loads, users, carrierVehicles, carrierDrivers } from '../../../db/schema';
import { and, desc, eq, gte, count, or } from 'drizzle-orm';
import { z } from 'zod';
import { currentAccount } from '../../../lib/account-auth';
import { COMMISSION_RATE_BPS, freightQuote } from '../../../lib/billing';
import { carrierDossier, requireCarrierReady } from '../../../lib/carrier-compliance';
import { AuthError } from '../../../lib/account-auth';

export const dynamic = 'force-dynamic';
const dayInNicaragua = () => {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Managua', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  return ['year', 'month', 'day'].map(key => parts.find(p => p.type === key)!.value).join('-');
};
const text = (max: number) => z.string().trim().min(1).max(max);
const schema = z.object({
  origin: text(60), destination: text(60),
  pickupDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
    const date = new Date(value + 'T12:00:00Z');
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value && value >= dayInNicaragua();
  }, 'La fecha debe ser válida y no estar en el pasado.'),
  equipment: z.enum(['Furgón cerrado', 'Refrigerado', 'Plataforma', 'Cabezal']),
  weight: z.number().finite().positive().max(100000),
  pay: z.number().finite().min(1).max(1000000).refine(value => Math.abs(value * 100 - Math.round(value * 100)) < 0.000001),
  acceptCommission: z.literal(true),
  company: text(80), email: z.string().trim().email().max(120)
});
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Vary': 'Cookie' } });

export async function GET(request: Request) {
  try {
    const user = await currentAccount(request);
    if (!user) return json({ error: 'Inicia sesión o regístrate para ver las cargas.', user: null, signedIn: false }, 401);
    const mine = new URL(request.url).searchParams.get('mine') === '1';
    if (!mine && user.role === 'transportista' && !(await carrierDossier(user.id)).ready) return json({ error: 'Completa tu expediente con los documentos requeridos y fechas vigentes para ver las cargas.', onboardingRequired: true, user }, 403);
    if (mine && !user) return json({ error: 'Inicia sesión para ver tus cargas.' }, 401);
    if (usesSupabase()) return json({ error: 'La migración debe incluir las operaciones y comisiones antes de cambiar de base de datos.' }, 503);
    const owner = `account:${user.id}`;
    const db = getDb();
    const data = await db.select({ load: loads, carrierName: users.name, carrierEmail: users.email, vehiclePlate: carrierVehicles.plate, driverName: carrierDrivers.name, licenseCategory: carrierVehicles.requiredCategory }).from(loads).leftJoin(users, eq(loads.carrierId, users.id)).leftJoin(carrierVehicles, eq(loads.transportVehicleId, carrierVehicles.id)).leftJoin(carrierDrivers, eq(loads.transportDriverId, carrierDrivers.id))
      .where(mine ? or(eq(loads.ownerId, owner), eq(loads.carrierId, user.id)) : and(gte(loads.pickupDate, dayInNicaragua()), eq(loads.status, 'disponible'))).orderBy(desc(loads.createdAt)).limit(500);
    const invoices = mine ? await db.select({ loadId: commissions.loadId, status: commissions.status, amountCents: commissions.amountCents }).from(commissions).where(or(eq(commissions.payerId, user.id), eq(commissions.carrierId, user.id))) : [];
    const invoiceMap = new Map(invoices.map(invoice => [invoice.loadId, invoice]));
    const visible = data.map(({ load, carrierName, carrierEmail, vehiclePlate, driverName, licenseCategory }) => {
      const own = load.ownerId === owner;
      const assigned = load.carrierId === user.id;
      const { ownerId, carrierId, ...record } = load;
      let quote = null;
      try { quote = freightQuote(load.pay, load.feeAcceptedAt ? load.feeRateBps : COMMISSION_RATE_BPS); } catch { /* Legacy invalid fares remain visible and removable. */ }
      return { ...record, carrierName, carrierEmail, vehiclePlate, driverName, licenseCategory, isOwner: own, isCarrier: assigned, canDelete: own && load.status === 'disponible', canAssign: own && load.status === 'disponible' && Boolean(quote),
        quote, commissionAccepted: Boolean(load.feeAcceptedAt), commission: invoiceMap.get(load.id) || null };
    });
    return json({ loads: visible, signedIn: Boolean(user), user });
  } catch (error) {
    console.error('No se pudieron consultar las cargas', error);
    return json({ error: 'No pudimos consultar las cargas. Intenta de nuevo.' }, 503);
  }
}

export async function POST(request: Request) {
  let user;
  try { user = await currentAccount(request); }
  catch { return json({ error: 'No pudimos verificar tu sesión. Intenta de nuevo.' }, 503); }
  if (!user) return json({ error: 'Inicia sesión con tu cuenta de RutaCarga para publicar.' }, 401);
  if (user.role === 'transportista') {
    try { await requireCarrierReady(user.id); }
    catch (error) { return json({ error: error instanceof AuthError ? error.message : 'No pudimos verificar tu expediente.', onboardingRequired: true }, error instanceof AuthError ? error.status : 503); }
  }
  if (usesSupabase()) return json({ error: 'Las comisiones requieren la base D1 activa.' }, 503);
  const ownerId = `account:${user.id}`;
  if (request.headers.get('origin') !== new URL(request.url).origin) return json({ error: 'Origen de solicitud no válido.' }, 403);
  if (!request.headers.get('content-type')?.startsWith('application/json')) return json({ error: 'Formato no válido.' }, 415);
  if (Number(request.headers.get('content-length') || 0) > 8192) return json({ error: 'La solicitud es demasiado grande.' }, 413);
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).length > 8192) return json({ error: 'La solicitud es demasiado grande.' }, 413);
    let parsed;
    try { parsed = schema.safeParse(JSON.parse(raw)); } catch { return json({ error: 'La solicitud no es válida.' }, 400); }
    if (!parsed.success) return json({ error: 'Revisa los datos y acepta la comisión del 10% a cargo de la empresa.' }, 400);
    const since = new Date(Date.now() - 86400000).toISOString();
    const recentCount = (await getDb().select({ value: count() }).from(loads).where(and(eq(loads.ownerId, ownerId), gte(loads.createdAt, since))))[0].value;
    if (recentCount >= 10) return json({ error: 'Puedes publicar hasta 10 cargas en 24 horas. Intenta mañana.' }, 429);
    const { acceptCommission, ...details } = parsed.data;
    const quote = freightQuote(details.pay);
    const now = new Date().toISOString();
    const load = { ...details, id: crypto.randomUUID(), createdAt: now, status: 'disponible' as const, feeRateBps: COMMISSION_RATE_BPS, feeCents: quote.commissionCents, feeAcceptedAt: now };
    await getDb().insert(loads).values({ ...load, ownerId });
    return json({ load: { ...load, canDelete: true, canAssign: true, isOwner: true, isCarrier: false, quote, commissionAccepted: true, commission: null } }, 201);
  } catch (error) {
    console.error('No se pudo publicar la carga', error);
    return json({ error: 'No pudimos guardar la carga. Intenta de nuevo.' }, 503);
  }
}
