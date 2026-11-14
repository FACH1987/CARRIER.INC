import { eq } from 'drizzle-orm';
import { getDb } from '../db';
import { carrierProfiles, carrierDrivers, carrierVehicles, carrierDocuments } from '../db/schema';
import { AuthError } from './account-auth';

export const categories = ['3', '4A', '5A', '6A', '7'] as const;
export const requirements = {
  profile: ['identity', 'ruc', 'company_registration', 'operation'],
  driver: ['identity', 'license', 'driver_insurance'],
  vehicle: ['circulation', 'vehicle_insurance', 'inspection', 'emissions', 'road_tax', 'weights', 'operation']
} as const;
export const documentLabels: Record<string, string> = {
  identity: 'Cédula / identificación (ambos lados)', license: 'Licencia de conducir (ambos lados y categorías)',
  driver_insurance: 'Seguro de licencia del conductor', ruc: 'RUC del operador', company_registration: 'Constitución / registro del operador',
  operation: 'Autorización / documento de operación aplicable', circulation: 'Circulación del vehículo', vehicle_insurance: 'Carné / póliza de seguro del vehículo',
  inspection: 'Inspección técnico-mecánica', emissions: 'Control de emisiones', road_tax: 'Rodamiento', weights: 'Certificado de pesos y dimensiones', special_permit: 'Permiso de carga especializada'
};
// Only the administrator can accept a reasoned non-applicability request.
export const exemptable = ['ruc', 'company_registration', 'operation', 'weights', 'special_permit'];
export const timeless = ['identity', 'circulation', 'ruc', 'company_registration'];
export function todayNI() { return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Managua', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); }
export function validDate(value: string) { return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value + 'T12:00:00Z')) && new Date(value + 'T12:00:00Z').toISOString().slice(0, 10) === value; }
export function documentIsValid(doc: typeof carrierDocuments.$inferSelect | undefined, day: string) {
  return Boolean(doc && doc.status === 'approved' && (doc.exemption || (doc.issuedAt && doc.issuedAt <= day && (doc.noExpiry || (doc.expiresAt && doc.expiresAt >= day)))));
}
export async function carrierDossier(userId: string, day = todayNI()) {
  const db = getDb();
  const [[profile], drivers, vehicles, documents] = await Promise.all([
    db.select().from(carrierProfiles).where(eq(carrierProfiles.userId, userId)),
    db.select().from(carrierDrivers).where(eq(carrierDrivers.userId, userId)),
    db.select().from(carrierVehicles).where(eq(carrierVehicles.userId, userId)),
    db.select().from(carrierDocuments).where(eq(carrierDocuments.userId, userId))
  ]);
  const checked = (entityType: 'profile' | 'driver' | 'vehicle', entityId: string, types: readonly string[]) => types.map(type => {
    const doc = documents.find(item => item.entityType === entityType && item.entityId === entityId && item.type === type);
    return { type, label: documentLabels[type], valid: documentIsValid(doc, day), document: doc ? { ...doc, objectKey: undefined, userId: undefined } : null };
  });
  const profileChecklist = profile ? checked('profile', userId, profile.kind === 'flota' ? requirements.profile : ['identity']) : [];
  const profileReady = Boolean(profile && profileChecklist.every(item => item.valid));
  const driverRows = drivers.map(driver => {
    const checklist = checked('driver', driver.id, requirements.driver);
    return { ...driver, categories: JSON.parse(driver.categories) as string[], checklist, ready: checklist.every(item => item.valid) };
  });
  const vehicleRows = vehicles.map(vehicle => {
    const driver = driverRows.find(row => row.id === vehicle.driverId);
    const checklist = checked('vehicle', vehicle.id, [...requirements.vehicle, ...(vehicle.requiredCategory === '7' ? ['special_permit'] : [])]);
    return { ...vehicle, driverName: driver?.name, checklist, ready: profileReady && Boolean(driver?.ready && driver.categories.includes(vehicle.requiredCategory)) && checklist.every(item => item.valid) };
  });
  return { profile: profile || null, profileChecklist, drivers: driverRows, vehicles: vehicleRows, ready: profileReady && vehicleRows.some(row => row.ready), day, documentLabels, exemptable, timeless };
}
export async function requireCarrierReady(userId: string, vehicleId?: string, day = todayNI()) {
  const dossier = await carrierDossier(userId, day < todayNI() ? todayNI() : day);
  const vehicle = vehicleId ? dossier.vehicles.find(row => row.id === vehicleId && row.ready) : dossier.vehicles.find(row => row.ready);
  if (!vehicle) throw new AuthError('Completa tu expediente: necesitas documentos aprobados y vigentes del operador, conductor y vehículo.', 403);
  return vehicle;
}
