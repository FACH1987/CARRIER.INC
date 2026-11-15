import { env } from 'cloudflare:workers';

export const adminAccountId = () => (env as unknown as { ADMIN_ACCOUNT_ID?: string }).ADMIN_ACCOUNT_ID || '';

export function withAdminAccess<T extends { id: string; role: string }>(account: T): Omit<T, 'role'> & { role: T['role'] | 'administrador'; isAdmin: boolean };
export function withAdminAccess<T extends { id: string }>(account: T): T & { isAdmin: boolean };
export function withAdminAccess(account: { id: string }): object {
  const configured = adminAccountId();
  const isAdmin = Boolean(configured && account.id === configured);
  return { ...account, ...('role' in account && isAdmin ? { role: 'administrador' } : {}), isAdmin };
}
