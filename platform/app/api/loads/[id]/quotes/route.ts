import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '../../../../../db';
import { loadQuotes, loads, users } from '../../../../../db/schema';
import { AuthError, authFailure, currentAccount, readAuthJson, responseJson } from '../../../../../lib/account-auth';
import { carrierDossier, todayNI } from '../../../../../lib/carrier-compliance';
import { activePlan, nicaraguaMonthStart } from '../../../../../lib/subscriptions';
import { customerTypeFor } from '../../../../../lib/load-access';
import { chatPublicName } from '../../../../../lib/load-chat';

export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ id: string }> };
const offerSchema = z.object({ amountCents: z.number().int().min(100).max(100000000) });

async function readLoad(context: Context) {
  const { id } = await context.params;
  if (!z.string().uuid().safeParse(id).success) throw new AuthError('Carga no encontrada.', 404);
  const [row] = await getDb().select({ load: loads, publisherRole: users.role }).from(loads)
    .leftJoin(users, eq(users.id, sql<string>`substr(${loads.ownerId}, 9)`)).where(eq(loads.id, id));
  if (!row) throw new AuthError('Carga no encontrada.', 404);
  return row;
}

export async function GET(request: Request, context: Context) {
  try {
    const account = await currentAccount(request);
    if (!account) throw new AuthError('Inicia sesión.', 401);
    const { load } = await readLoad(context);
    if (load.ownerId !== `account:${account.id}`) throw new AuthError('Solo quien publicó la carga puede ver las cotizaciones.', 403);
    const rating = sql<number | null>`(SELECT avg(score) FROM carrier_ratings WHERE carrier_id = ${loadQuotes.carrierId})`;
    const quotes = await getDb().select({
      name: users.name, carrierId: users.id, amountCents: loadQuotes.amountCents, priority: loadQuotes.priority, rating,
    }).from(loadQuotes).innerJoin(users, eq(users.id, loadQuotes.carrierId))
      .where(eq(loadQuotes.loadId, load.id)).orderBy(desc(loadQuotes.priority), desc(rating), asc(loadQuotes.createdAt)).limit(100);
    return responseJson({ quotes: quotes.map(quote => ({ ...quote, name: chatPublicName(quote.name, 'Transportista') })), currency: load.currency });
  } catch (error) { return authFailure(error); }
}

export async function POST(request: Request, context: Context) {
  try {
    const account = await currentAccount(request);
    if (!account) throw new AuthError('Inicia sesión.', 401);
    if (account.role !== 'transportista') throw new AuthError('Solo los transportistas pueden cotizar.', 403);
    const data = offerSchema.safeParse(await readAuthJson(request));
    if (!data.success) throw new AuthError('Indica un flete válido en la moneda de la carga.');
    const { load, publisherRole } = await readLoad(context);
    if (load.ownerId === `account:${account.id}`) throw new AuthError('Tu cuenta publicó esta carga.', 403);
    if (load.status !== 'disponible') throw new AuthError('La carga ya no admite cotizaciones.', 409);
    if (load.pickupDate < todayNI()) throw new AuthError('La fecha de recogida ya pasó.', 409);
    const now = new Date().toISOString();
    const plan = await activePlan(account.id, now);
    const dossier = await carrierDossier(account.id, load.pickupDate);
    const compatible = dossier.vehicles.filter(vehicle => vehicle.ready && vehicle.equipment === load.equipment && vehicle.capacityKg >= load.weight);
    const gold = plan === 'elite' && compatible.some(vehicle => vehicle.policeVerified);
    const customerType = customerTypeFor(load.customerType, publisherRole);
    if (customerType === 'empresa' && !gold) throw new AuthError('Este es un flete corporativo exclusivo para miembros Elite (con Récord de Policía verificado). Sube tu Récord de Policía y activa tu plan para cotizar ahora.', 403);
    if (customerType === 'comercio' && !plan) throw new AuthError('Para cotizar fletes de pequeños comercios, activa Chofer Pro o Flota / Elite.', 403);
    const delay = gold ? 0 : plan === 'chofer-pro' ? 5 : 15;
    if (Date.parse(now) < Date.parse(load.createdAt) + delay * 60_000) {
      throw new AuthError(`Este flete está en acceso anticipado. Podrás cotizar a partir de ${delay} minutos después de su publicación.`, 403);
    }
    if (!compatible.length) throw new AuthError('Necesitas un vehículo compatible con expediente vigente para cotizar.', 403);

    const db = getDb();
    const priority = gold ? 2 : plan === 'chofer-pro' ? 1 : 0;
    const [inserted] = await db.all<{ id: string }>(sql`
      INSERT INTO load_quotes (id, load_id, carrier_id, amount_cents, created_at, priority)
      SELECT ${crypto.randomUUID()}, ${load.id}, ${account.id}, ${data.data.amountCents}, ${now}, ${priority}
      WHERE EXISTS (SELECT 1 FROM loads WHERE id = ${load.id} AND status = 'disponible')
        AND ${priority > 0 ? sql`1` : sql`(SELECT count(*) FROM load_quotes WHERE carrier_id = ${account.id} AND created_at >= ${nicaraguaMonthStart()}) < 3`}
      ON CONFLICT (carrier_id, load_id) DO NOTHING
      RETURNING id
    `);
    if (!inserted) {
      const [existing] = await db.select().from(loadQuotes).where(and(eq(loadQuotes.loadId, load.id), eq(loadQuotes.carrierId, account.id)));
      if (existing) throw new AuthError('Ya enviaste una cotización para esta carga.', 409);
      throw new AuthError('La carga ya no está disponible o alcanzaste tu cupo mensual de cotizaciones.', 409);
    }
    return responseJson({ saved: true }, 201);
  } catch (error) { return authFailure(error); }
}
