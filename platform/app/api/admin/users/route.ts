import { and, count, desc, or, sql } from 'drizzle-orm';
import { getDb } from '../../../../db';
import { users } from '../../../../db/schema';
import { authFailure, currentAccount, responseJson } from '../../../../lib/account-auth';
import { ADMIN_DISPLAY_NAME, adminAccountId, withAdminAccess } from '../../../../lib/admin-policy';
import { protectedFinancialHistory } from '../../../../lib/billing';

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
    if (!['', 'empresa', 'transportista', 'administrador'].includes(role) || query.length > 120 || !Number.isInteger(page) || page < 1 || page > 100000) return responseJson({ error: 'Revisa los filtros de búsqueda.' }, 400);
    const needle = query.toLowerCase();
    const phoneNeedle = query.replace(/[\s()+-]/g, '');
    const phoneFilter = /^\d{3,15}$/.test(phoneNeedle) ? sql`instr(${users.phone}, ${phoneNeedle}) > 0` : undefined;
    const effectiveRole = sql<'empresa' | 'transportista' | 'administrador'>`case when ${users.id} = ${adminAccountId()} then 'administrador' else ${users.role} end`;
    const filter = and(
      role ? sql`${effectiveRole} = ${role}` : undefined,
      query ? or(sql`instr(lower(${users.name}), ${needle}) > 0`, sql`instr(lower(${users.email}), ${needle}) > 0`, phoneFilter, and(sql`${users.id} = ${adminAccountId()}`, sql`instr(lower(${ADMIN_DISPLAY_NAME}), ${needle}) > 0`)) : undefined
    );
    const db = getDb();
    const pageSize = 25;
    const [rows, [matched], groups] = await Promise.all([
      db.select({ id: users.id, name: users.name, email: users.email, phone: users.phone, phoneVerifiedAt: users.phoneVerifiedAt,
        role: effectiveRole, createdAt: users.createdAt, protectedHistory: protectedFinancialHistory(users.id) }).from(users)
        .where(filter).orderBy(desc(users.createdAt), desc(users.id)).limit(pageSize).offset((page - 1) * pageSize),
      db.select({ total: count() }).from(users).where(filter),
      db.select({ role: effectiveRole, total: count() }).from(users).groupBy(effectiveRole)
    ]);
    const companies = groups.find(group => group.role === 'empresa')?.total || 0;
    const carriers = groups.find(group => group.role === 'transportista')?.total || 0;
    const administrators = groups.find(group => group.role === 'administrador')?.total || 0;
    return responseJson({ users: rows.map(({ protectedHistory, ...row }) => ({ ...withAdminAccess(row), canDelete: !withAdminAccess(row).isAdmin && !protectedHistory })), administrator: { email: account.email }, total: matched.total, page, pageSize, counts: { empresas: companies, transportistas: carriers, administradores: administrators, total: companies + carriers + administrators } });
  } catch (error) { return authFailure(error); }
}
