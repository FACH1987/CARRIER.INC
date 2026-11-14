import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '../../../../../db';
import { commissions, loads, users } from '../../../../../db/schema';
import { usesSupabase } from '../../../../../db/supabase';
import { AuthError, authFailure, currentAccount, readAuthJson, responseJson } from '../../../../../lib/account-auth';
import { COMMISSION_RATE_BPS, freightQuote } from '../../../../../lib/billing';
import { carrierDossier, requireCarrierReady, todayNI } from '../../../../../lib/carrier-compliance';

export const dynamic = 'force-dynamic';
const actionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('options'), carrierEmail: z.string().trim().email().max(120).transform(value => value.toLowerCase()) }),
  z.object({ action: z.literal('assign'), carrierEmail: z.string().trim().email().max(120).transform(value => value.toLowerCase()), vehicleId: z.string().uuid(), acceptCommission: z.literal(true) }),
  z.object({ action: z.enum(['accept', 'reject', 'cancel_assignment', 'deliver', 'complete']) })
]);
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const parsed = actionSchema.safeParse(await readAuthJson(request));
    if (!parsed.success) throw new AuthError('Revisa la acción, el correo del transportista y la aceptación de la comisión.');
    const account = await currentAccount(request);
    if (!account) throw new AuthError('Inicia sesión para gestionar la carga.', 401);
    if (usesSupabase()) throw new AuthError('El módulo de comisiones requiere la base D1 activa.', 503);
    const id = (await context.params).id;
    if (!z.string().uuid().safeParse(id).success) throw new AuthError('Carga no encontrada.', 404);
    const db = getDb();
    const [load] = await db.select().from(loads).where(eq(loads.id, id)).limit(1);
    if (!load) throw new AuthError('Carga no encontrada.', 404);
    const owner = load.ownerId === `account:${account.id}`;
    const carrier = load.carrierId === account.id;
    const data = parsed.data;
    const now = new Date().toISOString();
    if (data.action === 'assign' || data.action === 'options') {
      if (!owner) throw new AuthError('Solo quien publicó la carga puede asignarla.', 403);
      if (load.status !== 'disponible') throw new AuthError('La carga ya no está disponible para asignar.', 409);
      const [candidate] = await db.select({ id: users.id, name: users.name }).from(users).where(and(eq(users.email, data.carrierEmail), eq(users.role, 'transportista'))).limit(1);
      if (!candidate || candidate.id === account.id) throw new AuthError('Indica el correo de otro usuario registrado como transportista.', 400);
      const day = load.pickupDate > todayNI() ? load.pickupDate : todayNI();
      if (data.action === 'options') {
        const dossier = await carrierDossier(candidate.id, day);
        return responseJson({ vehicles: dossier.vehicles.filter(vehicle => vehicle.ready && vehicle.equipment === load.equipment && vehicle.capacityKg >= load.weight).map(vehicle => ({ id: vehicle.id, plate: vehicle.plate, description: vehicle.description, driverName: vehicle.driverName, category: vehicle.requiredCategory })), checkedThrough: day });
      }
      const vehicle = await requireCarrierReady(candidate.id, data.vehicleId, day);
      if (vehicle.equipment !== load.equipment || vehicle.capacityKg < load.weight) throw new AuthError('El vehículo no corresponde al equipo o capacidad de la carga.');
      const quote = freightQuote(load.pay, load.feeAcceptedAt ? load.feeRateBps : COMMISSION_RATE_BPS);
      const updated = await db.update(loads).set({ carrierId: candidate.id, transportVehicleId: vehicle.id, transportDriverId: vehicle.driverId, status: 'asignada', assignedAt: now, acceptedAt: null, deliveredAt: null, completedAt: null, feeRateBps: quote.rateBps, feeCents: quote.commissionCents, feeAcceptedAt: load.feeAcceptedAt || now })
        .where(and(eq(loads.id, id), eq(loads.ownerId, load.ownerId), eq(loads.status, 'disponible'))).returning({ id: loads.id });
      if (!updated.length) throw new AuthError('La carga cambió. Actualiza el tablero.', 409);
      return responseJson({ status: 'asignada', carrierName: candidate.name, quote });
    }
    if (data.action === 'complete') {
      if (!owner) throw new AuthError('Solo quien publicó la carga puede confirmar la finalización.', 403);
      const [existing] = await db.select({ id: commissions.id }).from(commissions).where(eq(commissions.loadId, id)).limit(1);
      if (load.status === 'finalizada' && existing) return responseJson({ status: 'finalizada', commissionId: existing.id });
      if (load.status !== 'entregada' || !load.carrierId || !load.feeAcceptedAt) throw new AuthError('El transportista debe confirmar la entrega antes de finalizar.', 409);
      const quote = freightQuote(load.pay, load.feeRateBps);
      if (quote.commissionCents !== load.feeCents || load.feeRateBps !== COMMISSION_RATE_BPS) throw new AuthError('La comisión acordada requiere revisión antes de finalizar.', 409);
      await db.batch([
        db.insert(commissions).values({ id: crypto.randomUUID(), loadId: id, payerId: account.id, carrierId: load.carrierId, fareCents: quote.fareCents, rateBps: load.feeRateBps, amountCents: load.feeCents, status: 'pending', createdAt: now }).onConflictDoNothing({ target: commissions.loadId }),
        db.update(loads).set({ status: 'finalizada', completedAt: now }).where(and(eq(loads.id, id), eq(loads.status, 'entregada'), eq(loads.ownerId, load.ownerId)))
      ]);
      const [invoice] = await db.select({ id: commissions.id }).from(commissions).where(eq(commissions.loadId, id)).limit(1);
      return responseJson({ status: 'finalizada', commissionId: invoice.id });
    }
    if (data.action === 'cancel_assignment') {
      if (!owner) throw new AuthError('Solo quien publicó la carga puede retirar la asignación.', 403);
    } else if (!carrier) throw new AuthError('Solo el transportista asignado puede realizar esta acción.', 403);
    const expected = data.action === 'deliver' ? 'en_transito' : 'asignada';
    if (load.status !== expected) throw new AuthError('El estado de la carga no permite esa acción.', 409);
    if (data.action === 'accept') {
      if (!load.transportVehicleId) throw new AuthError('Solicita una nueva asignación con vehículo verificado.', 409);
      await requireCarrierReady(account.id, load.transportVehicleId, load.pickupDate);
    }
    const status = data.action === 'accept' ? 'en_transito' : data.action === 'deliver' ? 'entregada' : 'disponible';
    const updated = await db.update(loads).set({ status, ...(status === 'disponible' ? { carrierId: null, transportVehicleId: null, transportDriverId: null, assignedAt: null, acceptedAt: null } : {}), ...(status === 'en_transito' ? { acceptedAt: now } : {}), ...(status === 'entregada' ? { deliveredAt: now } : {}) })
      .where(and(eq(loads.id, id), eq(loads.status, expected), data.action === 'cancel_assignment' ? eq(loads.ownerId, load.ownerId) : eq(loads.carrierId, account.id))).returning({ id: loads.id });
    if (!updated.length) throw new AuthError('La carga cambió. Actualiza el tablero.', 409);
    return responseJson({ status });
  } catch (error) { return authFailure(error); }
}
