import { env } from 'cloudflare:workers';

export function withAdminAccess<T extends { id: string }>(account: T): T & { isAdmin: boolean } {
  const configured = (env as unknown as { ADMIN_ACCOUNT_ID?: string }).ADMIN_ACCOUNT_ID;
  return { ...account, isAdmin: Boolean(configured && account.id === configured) };
}
