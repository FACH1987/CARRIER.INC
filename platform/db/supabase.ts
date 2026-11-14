import { env } from 'cloudflare:workers';

type Load = { id: string; origin: string; destination: string; pickupDate: string; equipment: string; weight: number; pay: number; company: string; email: string; createdAt: string };
type Config = { SUPABASE_URL?: string; SUPABASE_SECRET_KEY?: string; DATABASE_PROVIDER?: string };
const configuration = () => env as unknown as Config;
export const usesSupabase = () => configuration().DATABASE_PROVIDER === 'supabase';

async function request(path: string, init: RequestInit = {}) {
  const config = configuration();
  if (!config.SUPABASE_URL || !config.SUPABASE_SECRET_KEY) throw new Error('Falta la configuración de Supabase.');
  const url = new URL(config.SUPABASE_URL);
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/') throw new Error('URL de Supabase no válida.');
  const response = await fetch(new URL('/rest/v1/' + path, url), {
    ...init,
    headers: { apikey: config.SUPABASE_SECRET_KEY, 'Content-Type': 'application/json', ...init.headers },
    signal: AbortSignal.timeout(10000)
  });
  if (!response.ok) throw new Error('Supabase no pudo completar la operación (' + response.status + ').');
  return response;
}

export async function listSupabaseLoads(today: string, ownerId?: string): Promise<(Load & { ownerId: string })[]> {
  const query = new URLSearchParams({ select: 'id,ownerId:owner_id,origin,destination,pickupDate:pickup_date,equipment,weight,pay,company,email,createdAt:created_at', order: 'created_at.desc', limit: '500' });
  if (ownerId) query.set('owner_id', 'eq.' + ownerId);
  else query.set('pickup_date', 'gte.' + today);
  return (await request('loads?' + query)).json();
}

export async function deleteSupabaseLoad(id: string, ownerId: string): Promise<{ id: string }[]> {
  const query = new URLSearchParams({ id: 'eq.' + id, owner_id: 'eq.' + ownerId, select: 'id' });
  return (await request('loads?' + query, { method: 'DELETE', headers: { Prefer: 'return=representation' } })).json();
}

export async function countSupabaseLoads(ownerId: string, since: string): Promise<number> {
  const query = new URLSearchParams({ select: 'id', owner_id: 'eq.' + ownerId, created_at: 'gte.' + since, limit: '10' });
  const rows: { id: string }[] = await (await request('loads?' + query)).json();
  return rows.length;
}

export async function insertSupabaseLoad(load: Load, ownerId: string): Promise<void> {
  await request('loads', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({
    id: load.id, owner_id: ownerId, origin: load.origin, destination: load.destination,
    pickup_date: load.pickupDate, equipment: load.equipment, weight: load.weight,
    pay: load.pay, company: load.company, email: load.email, created_at: load.createdAt
  }) });
}
