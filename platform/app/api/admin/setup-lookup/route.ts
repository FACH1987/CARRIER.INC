import { env } from 'cloudflare:workers';
import { createHash, timingSafeEqual } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { getDb } from '../../../../db';
import { users } from '../../../../db/schema';
import { responseJson } from '../../../../lib/account-auth';

export const dynamic = 'force-dynamic';
// Read-only, owner-operated provisioning. Disabled when temporary secrets are removed.
// It never grants access, creates accounts, or accepts an email supplied by a caller.
export async function GET(request: Request) {
  const config = env as unknown as { ADMIN_SETUP_TOKEN?: string; ADMIN_SETUP_EMAIL?: string };
  const token = request.headers.get('authorization')?.replace(/^Bearer /, '') || '';
  const hash = (value: string) => createHash('sha256').update(value).digest();
  if (!config.ADMIN_SETUP_TOKEN || !config.ADMIN_SETUP_EMAIL || !token || !timingSafeEqual(hash(token), hash(config.ADMIN_SETUP_TOKEN))) return responseJson({ error: 'No encontrado.' }, 404);
  try {
    const [account] = await getDb().select({ id: users.id }).from(users).where(eq(users.email, config.ADMIN_SETUP_EMAIL.trim().toLowerCase())).limit(1);
    return responseJson({ found: Boolean(account), userId: account?.id || null });
  } catch { return responseJson({ error: 'No se pudo consultar la cuenta.' }, 503); }
}
