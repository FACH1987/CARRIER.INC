import { and, count, desc, eq, or, sql } from 'drizzle-orm';
import { getDb } from '../../../../db';
import { users } from '../../../../db/schema';
import { authFailure, currentAccount, responseJson } from '../../../../lib/account-auth';
import { withAdminAccess } from '../../../../lib/admin-policy';

export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  try {
    const account = await currentAccount(request);
    if (!account) return responseJson({ error: 'Inicia sesión para acceder al panel.' }, 401);
    if (!account.isAdmin) return responseJson({ error: 'Este panel es exclusivo del administrador.' }, 403);
    const params = new URL(request.url).searchParams;
    const role = params.get('role') || '';
    const query = (params.get('q') || '').trim();
    const page = Number(params.get('page') || '1');
    if (!['', 'empresa', 'transportista'].includes(role) || query.length > 120 || !Number.isInteger(page) || page < 1 || page > 100000) return responseJson({ error: 'Revisa los filtros de búsqueda.' }, 400);
    const needle = query.toLowerCase();
    const filter = and(
      role ? eq(users.role, role as 'empresa' | 'transportista') : undefined,
      query ? or(sql`instr(lower(${users.name}), ${needle}) > 0`, sql`instr(lower(${users.email}), ${needle}) > 0`) : undefined
    );
    const db = getDb();
    const pageSize = 25;
    const [rows, [matched], groups] = await Promise.all([
      db.select({ id: users.id, name: users.name, email: users.email, role: users.role, createdAt: users.createdAt }).from(users)
        .where(filter).orderBy(desc(users.createdAt), desc(users.id)).limit(pageSize).offset((page - 1) * pageSize),
      db.select({ total: count() }).from(users).where(filter),
      db.select({ role: users.role, total: count() }).from(users).groupBy(users.role)
    ]);
    const companies = groups.find(group => group.role === 'empresa')?.total || 0;
    const carriers = groups.find(group => group.role === 'transportista')?.total || 0;
    return responseJson({ users: rows.map(row => ({ ...row, isAdmin: withAdminAccess(row).isAdmin, canDelete: !withAdminAccess(row).isAdmin })), administrator: { email: account.email }, total: matched.total, page, pageSize, counts: { empresas: companies, transportistas: carriers, total: companies + carriers } });
  } catch (error) { return authFailure(error); }
}
