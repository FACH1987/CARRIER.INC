import { and, eq, count } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '../../../db';
import { users, carrierProfiles, carrierDrivers, carrierVehicles } from '../../../db/schema';
import { currentAccount, readAuthJson, responseJson, authFailure, AuthError } from '../../../lib/account-auth';
import { carrierDossier, categories } from '../../../lib/carrier-compliance';
export const dynamic = 'force-dynamic';
const name = z.string().trim().min(2).max(120);
const schema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('profile'), kind: z.enum(['independiente', 'flota']), legalName: name, consent: z.literal(true) }),
  z.object({ action: z.literal('driver'), name, categories: z.array(z.enum(categories)).min(1).max(5) }),
  z.object({ action: z.literal('vehicle'), driverId: z.string().uuid(), plate: z.string().trim().min(3).max(15).regex(/^[A-Za-z0-9 -]+$/).transform(x => x.toUpperCase()), description: name, equipment: z.enum(['Furgón cerrado', 'Refrigerado', 'Plataforma', 'Cabezal']), capacityKg: z.number().positive().max(100000), requiredCategory: z.enum(categories) })
]);
export async function GET(request: Request) {
  try {
    const account = await currentAccount(request);
    if (!account) throw new AuthError('Inicia sesión.', 401);
    const target = new URL(request.url).searchParams.get('userId') || account.id;
    if (target !== account.id && !account.isAdmin) throw new AuthError('Acceso privado.', 403);
    const [owner] = await getDb().select({ role: users.role, name: users.name, email: users.email }).from(users).where(eq(users.id, target));
    if (!owner || owner.role !== 'transportista') throw new AuthError('Expediente no encontrado.', 404);
    return responseJson({ ...await carrierDossier(target), owner, userId: target, isAdmin: account.isAdmin });
  } catch (error) { return authFailure(error); }
}
export async function POST(request: Request) {
  try {
    const account = await currentAccount(request);
    if (!account) throw new AuthError('Inicia sesión.', 401);
    if (account.role !== 'transportista') throw new AuthError('Solo transportistas.', 403);
    const parsed = schema.safeParse(await readAuthJson(request));
    if (!parsed.success) throw new AuthError('Revisa los datos y acepta el tratamiento privado de tus documentos.');
    const data = parsed.data, db = getDb(), id = crypto.randomUUID();
    const [profile] = await db.select().from(carrierProfiles).where(eq(carrierProfiles.userId, account.id));
    if (data.action === 'profile') {
      if (profile) throw new AuthError('El perfil ya está creado. Para rectificarlo solicita revisión al administrador.', 409);
      await db.insert(carrierProfiles).values({ userId: account.id, kind: data.kind, legalName: data.legalName, consentAt: new Date().toISOString() });
    } else {
      if (!profile) throw new AuthError('Crea primero tu perfil de operación.');
      if (data.action === 'driver') {
        const [total] = await db.select({ n: count() }).from(carrierDrivers).where(eq(carrierDrivers.userId, account.id));
        if (total.n >= (profile.kind === 'independiente' ? 1 : 50)) throw new AuthError('Límite de conductores alcanzado.', 409);
        await db.insert(carrierDrivers).values({ id, userId: account.id, name: data.name, categories: JSON.stringify([...new Set(data.categories)]) });
      } else {
        const [driver] = await db.select().from(carrierDrivers).where(and(eq(carrierDrivers.id, data.driverId), eq(carrierDrivers.userId, account.id)));
        if (!driver || !JSON.parse(driver.categories).includes(data.requiredCategory)) throw new AuthError('El conductor debe declarar la categoría requerida por este vehículo.');
        const [total] = await db.select({ n: count() }).from(carrierVehicles).where(eq(carrierVehicles.userId, account.id));
        if (total.n >= (profile.kind === 'independiente' ? 1 : 50)) throw new AuthError('Límite de vehículos alcanzado.', 409);
        const duplicate = await db.select({ id: carrierVehicles.id }).from(carrierVehicles).where(and(eq(carrierVehicles.userId, account.id), eq(carrierVehicles.plate, data.plate)));
        if (duplicate.length) throw new AuthError('La placa ya está registrada en tu expediente.', 409);
        const { action, ...details } = data;
        await db.insert(carrierVehicles).values({ ...details, id, userId: account.id });
      }
    }
    return responseJson({ saved: true, id }, 201);
  } catch (error) { return authFailure(error); }
}
