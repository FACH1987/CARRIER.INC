import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '../../../db';
import { bankAccounts, users } from '../../../db/schema';
import { AuthError, authFailure, currentAccount, readAuthJson, requireSameOrigin, responseJson } from '../../../lib/account-auth';
import { withAdminAccess } from '../../../lib/admin-policy';
import { decryptBankNumber, encryptBankNumber } from '../../../lib/bank-account-security';

export const dynamic = 'force-dynamic';
const text = z.string().trim().min(2).max(120);
const saveSchema = z.object({ action: z.literal('save'), bankName: text, holderName: text, accountType: z.enum(['ahorro', 'corriente']), currency: z.enum(['NIO', 'USD']), accountNumber: z.string().max(50).transform(value => value.replace(/[\s-]/g, '').toUpperCase()).pipe(z.string().regex(/^[A-Z0-9]{6,34}$/)), consent: z.literal(true) });

async function access(request: Request) {
  const account = await currentAccount(request);
  if (!account) throw new AuthError('Inicia sesión para gestionar la cuenta bancaria.', 401);
  const userId = new URL(request.url).searchParams.get('userId') || account.id;
  if (!z.string().uuid().safeParse(userId).success) throw new AuthError('Cuenta no encontrada.', 404);
  if (userId !== account.id && !account.isAdmin) throw new AuthError('Esta cuenta bancaria es privada.', 403);
  const [stored] = await getDb().select({ id: users.id, name: users.name, role: users.role }).from(users).where(eq(users.id, userId));
  if (!stored) throw new AuthError('Cuenta no encontrada.', 404);
  const owner = withAdminAccess(stored);
  if (owner.role === 'administrador') throw new AuthError('Las cuentas bancarias son para empresas y transportistas.', 403);
  return { account, userId, owner, readOnly: userId !== account.id };
}
export async function GET(request: Request) {
  try {
    const { userId, owner, readOnly } = await access(request);
    const [row] = await getDb().select().from(bankAccounts).where(eq(bankAccounts.userId, userId));
    return responseJson({ owner, readOnly, bankAccount: row ? { bankName: row.bankName, holderName: row.holderName, accountType: row.accountType, currency: row.currency, maskedNumber: '•••• ' + row.lastFour, updatedAt: row.updatedAt } : null, transfersAutomatic: false });
  } catch (error) { return authFailure(error); }
}
export async function POST(request: Request) {
  try {
    const { userId, readOnly } = await access(request);
    const body = await readAuthJson(request);
    const reveal = z.object({ action: z.literal('reveal') }).safeParse(body);
    if (reveal.success) {
      const [row] = await getDb().select().from(bankAccounts).where(eq(bankAccounts.userId, userId));
      if (!row) throw new AuthError('Todavía no hay una cuenta bancaria registrada.', 404);
      return responseJson({ accountNumber: decryptBankNumber(row.encryptedNumber, userId) });
    }
    if (readOnly) throw new AuthError('Solo el titular puede cambiar su cuenta bancaria.', 403);
    const parsed = saveSchema.safeParse(body);
    if (!parsed.success) throw new AuthError('Revisa el banco, titular, tipo, moneda, número de cuenta y autorización.');
    const data = parsed.data, now = new Date().toISOString();
    const record = { bankName: data.bankName, holderName: data.holderName, accountType: data.accountType, currency: data.currency, encryptedNumber: encryptBankNumber(data.accountNumber, userId), lastFour: data.accountNumber.slice(-4), consentAt: now, updatedAt: now };
    await getDb().insert(bankAccounts).values({ userId, ...record }).onConflictDoUpdate({ target: bankAccounts.userId, set: record });
    return responseJson({ saved: true, transfersAutomatic: false });
  } catch (error) { return authFailure(error); }
}
export async function DELETE(request: Request) {
  try {
    requireSameOrigin(request);
    const { userId, readOnly } = await access(request);
    if (readOnly) throw new AuthError('Solo el titular puede eliminar su cuenta bancaria.', 403);
    await getDb().delete(bankAccounts).where(eq(bankAccounts.userId, userId));
    return responseJson({ deleted: true });
  } catch (error) { return authFailure(error); }
}
