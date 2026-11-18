import { usesSupabase } from '../../../db/supabase';
import { getDb } from '../../../db';
import { loads, users, carrierVehicles, carrierDrivers, carrierRatings } from '../../../db/schema';
import { and, desc, eq, gte, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
import { z } from 'zod';
import { currentAccount } from '../../../lib/account-auth';
import { carrierDossier, requireCarrierReady } from '../../../lib/carrier-compliance';
import { AuthError } from '../../../lib/account-auth';
import { equipmentTypes } from '../../../lib/equipment';
import { activePlan, nicaraguaMonthStart } from '../../../lib/subscriptions';
import { customerTypeFor, customerTypes, loadVisibilities } from '../../../lib/load-access';

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
  equipment: z.enum(equipmentTypes),
  weight: z.number().finite().positive().max(100000),
  pay: z.number().finite().min(1).max(1000000).refine(value => Math.abs(value * 100 - Math.round(value * 100)) < 0.000001),
  currency: z.literal('USD'),
  company: text(80), email: z.string().trim().email().max(120),
  customerType: z.enum(customerTypes).optional(),
  visibility: z.enum(loadVisibilities).default('estandar'),
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
    const publisher = alias(users, 'publisher');
    const data = await db.select({ load: loads, rating: carrierRatings.score, publisherRole: publisher.role, carrierName: users.name, carrierEmail: users.email, vehiclePlate: carrierVehicles.plate, driverName: carrierDrivers.name, licenseCategory: carrierVehicles.requiredCategory }).from(loads).leftJoin(users, eq(loads.carrierId, users.id)).leftJoin(publisher, eq(publisher.id, sql<string>`substr(${loads.ownerId}, 9)`)).leftJoin(carrierVehicles, eq(loads.transportVehicleId, carrierVehicles.id)).leftJoin(carrierDrivers, eq(loads.transportDriverId, carrierDrivers.id)).leftJoin(carrierRatings, eq(loads.id, carrierRatings.loadId))
      .where(mine ? or(eq(loads.ownerId, owner), eq(loads.carrierId, user.id)) : and(gte(loads.pickupDate, dayInNicaragua()), eq(loads.status, 'disponible')))
      .orderBy(...(mine ? [] : [sql`CASE ${loads.visibility} WHEN 'vip' THEN 0 WHEN 'destacada' THEN 1 ELSE 2 END`]), desc(loads.createdAt)).limit(500);
    const visible = data.map(({ load, rating, publisherRole, carrierName, carrierEmail, vehiclePlate, driverName, licenseCategory }) => {
      const own = user.role !== 'administrador' && load.ownerId === owner;
      const assigned = user.role !== 'administrador' && load.carrierId === user.id;
      const { ownerId, carrierId, deliveryEvidenceId, feeRateBps, feeCents, feeAcceptedAt, ...record } = load;
      const available = own && load.status === 'disponible';
      const customerType = customerTypeFor(load.customerType, publisherRole);
      return { ...record, customerType, corporate: customerType === 'empresa', carrierName, carrierEmail, vehiclePlate, driverName, licenseCategory, isOwner: own, isCarrier: assigned,
        rating: own ? rating : null,
        canDelete: available, canAssign: available && schema.shape.pay.safeParse(load.pay).success,
        hasDeliveryEvidence: (own || assigned) && Boolean(deliveryEvidenceId) };
    });
    return json({ loads: visible, plan: await activePlan(user.id), signedIn: Boolean(user), user });
  } catch (error) {
    console.error('No se pudieron consultar las cargas', error);
    return json({ error: 'No pudimos consultar las cargas. Intenta de nuevo.' }, 503);
  }
}

export async function POST(request: Request) {
  let user;
  try { user = await currentAccount(request); }
  catch { return json({ error: 'No pudimos verificar tu sesión. Intenta de nuevo.' }, 503); }
  if (!user) return json({ error: 'Inicia sesión con tu cuenta de Carrier.INC para publicar.' }, 401);
  if (user.role === 'administrador') return json({ error: 'La cuenta de administrador solo gestiona la plataforma; no publica cargas.' }, 403);
  if (user.role === 'transportista') {
    try { await requireCarrierReady(user.id); }
    catch (error) { return json({ error: error instanceof AuthError ? error.message : 'No pudimos verificar tu expediente.', onboardingRequired: true }, error instanceof AuthError ? error.status : 503); }
  }
  if (usesSupabase()) return json({ error: 'La publicación de cargas requiere la base D1 activa.' }, 503);
  const ownerId = `account:${user.id}`;
  if (request.headers.get('origin') !== new URL(request.url).origin) return json({ error: 'Origen de solicitud no válido.' }, 403);
  if (!request.headers.get('content-type')?.startsWith('application/json')) return json({ error: 'Formato no válido.' }, 415);
  if (Number(request.headers.get('content-length') || 0) > 8192) return json({ error: 'La solicitud es demasiado grande.' }, 413);
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).length > 8192) return json({ error: 'La solicitud es demasiado grande.' }, 413);
    let parsed;
    try { parsed = schema.safeParse(JSON.parse(raw)); } catch { return json({ error: 'La solicitud no es válida.' }, 400); }
    if (!parsed.success) return json({ error: 'Revisa los datos e indica el flete en USD.' }, 400);
    const details = parsed.data;
    const now = new Date().toISOString();
    const plan = await activePlan(user.id, now);
    if ((details.visibility === 'vip' && plan !== 'corporativo') ||
        (details.visibility === 'destacada' && plan !== 'negocio' && plan !== 'corporativo')) {
      return json({ error: 'La visibilidad seleccionada no está incluida en tu plan.' }, 403);
    }
    const load = { ...details, customerType: customerTypeFor(details.customerType ?? null, user.role),
      id: crypto.randomUUID(), createdAt: now, status: 'disponible' as const };
    const limit = user.role === 'empresa' ? (plan === 'corporativo' ? null : plan === 'negocio' ? 25 : 3) : 10;
    const since = user.role === 'empresa' ? nicaraguaMonthStart() : new Date(Date.parse(now) - 86400000).toISOString();
    const [published] = await getDb().all<{ id: string }>(sql`
      INSERT INTO loads (id, owner_id, origin, destination, pickup_date, equipment, weight, pay, currency, company, email, created_at, status, fee_rate_bps, customer_type, visibility)
      SELECT ${load.id}, ${ownerId}, ${load.origin}, ${load.destination}, ${load.pickupDate}, ${load.equipment},
        ${load.weight}, ${load.pay}, ${load.currency}, ${load.company}, ${load.email}, ${now}, 'disponible', 0, ${load.customerType}, ${load.visibility}
      WHERE ${limit === null ? sql`1` : sql`(SELECT count(*) FROM load_publications WHERE owner_id = ${ownerId} AND created_at >= ${since}) < ${limit}`}
      RETURNING id
    `);
    if (!published) return json({ error: user.role === 'empresa'
      ? `Tu plan permite ${limit} publicaciones por mes. Consulta los planes para ampliar tu cupo.`
      : 'Puedes publicar hasta 10 cargas en 24 horas.' }, 429);
    return json({ load: { ...load, canDelete: true, canAssign: true, isOwner: true, isCarrier: false } }, 201);
  } catch (error) {
    console.error('No se pudo publicar la carga', error);
    return json({ error: 'No pudimos guardar la carga. Intenta de nuevo.' }, 503);
  }
}
