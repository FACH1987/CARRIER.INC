import { createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { getDb } from '../db';
import { carrierNoticeReads } from '../db/schema';
import { carrierDossier } from './carrier-compliance';
import { reminderStage } from './document-rules';
export async function carrierNotifications(userId: string) {
  const dossier = await carrierDossier(userId);
  const groups = [
    { name: 'Operador', checklist: dossier.profileChecklist },
    ...dossier.drivers.map(driver => ({ name: 'Conductor: ' + driver.name, checklist: driver.checklist })),
    ...dossier.vehicles.map(vehicle => ({ name: 'Vehículo: ' + vehicle.plate, checklist: vehicle.checklist }))
  ];
  const read = new Set((await getDb().select({ id: carrierNoticeReads.id }).from(carrierNoticeReads).where(eq(carrierNoticeReads.userId, userId))).map(row => row.id));
  const alerts = groups.flatMap(group => group.checklist.flatMap(item => {
    const doc = item.document;
    const stage = reminderStage(item.daysLeft);
    if (!doc || !stage || doc.exemption || doc.noExpiry) return [];
    const id = createHash('sha256').update([userId, doc.id, doc.revision, doc.expiresAt, stage].join(':')).digest('hex');
    return [{ id, documentId: doc.id, title: item.label, subject: group.name, expiresAt: doc.expiresAt, daysLeft: item.daysLeft!, stage, read: read.has(id), severity: item.daysLeft! < 0 ? 'expired' : item.daysLeft! <= 7 ? 'urgent' : 'warning', message: item.reason, href: '/carrier.html' }];
  })).sort((a, b) => a.daysLeft - b.daysLeft || a.id.localeCompare(b.id));
  return { alerts, unread: alerts.filter(alert => !alert.read).length, accessAllowed: dossier.ready, enabledVehicles: dossier.vehicles.filter(vehicle => vehicle.ready).length, day: dossier.day };
}
