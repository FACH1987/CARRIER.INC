import { usesSupabase, listSupabaseLoads, countSupabaseLoads, insertSupabaseLoad } from '../../../db/supabase';
﻿import { getDb } from '../../../db';
import { loads } from '../../../db/schema';
import { and, desc, eq, gte, count } from 'drizzle-orm';
import { z } from 'zod';

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
  pay: z.number().finite().positive().max(1000000),
  company: text(80), email: z.string().trim().email().max(120)
});
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });

export async function GET(request: Request) {
  try {
    const data = usesSupabase() ? await listSupabaseLoads(dayInNicaragua()) : await getDb().select({ id: loads.id, origin: loads.origin, destination: loads.destination, pickupDate: loads.pickupDate, equipment: loads.equipment, weight: loads.weight, pay: loads.pay, company: loads.company, email: loads.email, createdAt: loads.createdAt }).from(loads).where(gte(loads.pickupDate, dayInNicaragua())).orderBy(desc(loads.createdAt)).limit(500);
    return json({ loads: data, signedIn: Boolean(request.headers.get('oai-authenticated-user-id')) });
  } catch (error) {
    console.error('No se pudieron consultar las cargas', error);
    return json({ error: 'No pudimos consultar las cargas. Intenta de nuevo.' }, 503);
  }
}

export async function POST(request: Request) {
  const ownerId = request.headers.get('oai-authenticated-user-id');
  if (!ownerId) return json({ error: 'Inicia sesión para publicar una carga.' }, 401);
  if (request.headers.get('origin') !== new URL(request.url).origin) return json({ error: 'Origen de solicitud no válido.' }, 403);
  if (!request.headers.get('content-type')?.startsWith('application/json')) return json({ error: 'Formato no válido.' }, 415);
  if (Number(request.headers.get('content-length') || 0) > 8192) return json({ error: 'La solicitud es demasiado grande.' }, 413);
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).length > 8192) return json({ error: 'La solicitud es demasiado grande.' }, 413);
    let parsed;
    try { parsed = schema.safeParse(JSON.parse(raw)); } catch { return json({ error: 'La solicitud no es válida.' }, 400); }
    if (!parsed.success) return json({ error: 'Revisa los datos: origen, destino, fecha, equipo, peso, pago y correo deben ser válidos.' }, 400);
    const since = new Date(Date.now() - 86400000).toISOString();
    const recentCount = usesSupabase() ? await countSupabaseLoads(ownerId, since) : (await getDb().select({ value: count() }).from(loads).where(and(eq(loads.ownerId, ownerId), gte(loads.createdAt, since))))[0].value;
    if (recentCount >= 10) return json({ error: 'Puedes publicar hasta 10 cargas en 24 horas. Intenta mañana.' }, 429);
    const load = { ...parsed.data, id: crypto.randomUUID(), createdAt: new Date().toISOString() };
    if (usesSupabase()) await insertSupabaseLoad(load, ownerId);
    else await getDb().insert(loads).values({ ...load, ownerId });
    return json({ load }, 201);
  } catch (error) {
    console.error('No se pudo publicar la carga', error);
    return json({ error: 'No pudimos guardar la carga. Intenta de nuevo.' }, 503);
  }
}
