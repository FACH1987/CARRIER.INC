import { createHash } from 'node:crypto';
import { and, desc, eq, gte, ne } from 'drizzle-orm';
import { getDb } from '../db';
import { loads, users, loadNoticeReads } from '../db/schema';
import { carrierDossier } from './carrier-compliance';
export async function newLoadNotifications(userId: string) {
  const db = getDb(), dossier = await carrierDossier(userId);
  if (!dossier.ready) return [];
  const [owner] = await db.select({ createdAt: users.createdAt }).from(users).where(eq(users.id, userId));
  if (!owner) return [];
  const since = new Date(Date.now() - 7 * 86400000).toISOString();
  const data = await db.select({ id: loads.id, origin: loads.origin, destination: loads.destination, pickupDate: loads.pickupDate, equipment: loads.equipment, weight: loads.weight, pay: loads.pay, company: loads.company, email: loads.email, createdAt: loads.createdAt }).from(loads)
    .where(and(eq(loads.status, 'disponible'), gte(loads.pickupDate, dossier.day), gte(loads.createdAt, since > owner.createdAt ? since : owner.createdAt), ne(loads.ownerId, 'account:' + userId))).orderBy(desc(loads.createdAt), desc(loads.id)).limit(50);
  const read = new Set((await db.select({ id: loadNoticeReads.id }).from(loadNoticeReads).where(eq(loadNoticeReads.userId, userId))).map(row => row.id));
  const through = (checklist: typeof dossier.profileChecklist, day: string) => checklist.every(item => item.valid && item.document && (item.document.exemption || item.document.noExpiry || (item.document.expiresAt && item.document.expiresAt >= day)));
  const result = [];
  for (const load of data) {
    if (!through(dossier.profileChecklist, load.pickupDate) || !dossier.vehicles.some(vehicle => vehicle.ready && vehicle.equipment === load.equipment && vehicle.capacityKg >= load.weight && through(vehicle.checklist, load.pickupDate) && through(dossier.drivers.find(driver => driver.id === vehicle.driverId)?.checklist || [], load.pickupDate))) continue;
    const id = createHash('sha256').update([userId, 'new-load', load.id].join(':')).digest('hex');
    result.push({ id, loadId: load.id, load, read: read.has(id), title: 'Nueva carga disponible', subject: load.origin + ' → ' + load.destination, message: `Empresa: ${load.company}. Recogida: ${load.pickupDate}. Equipo: ${load.equipment}. Peso: ${load.weight} kg. Flete: C$${load.pay.toFixed(2)}. Contacto: ${load.email}.`, href: '/market.html#tablero' });
  }
  return result;
}
