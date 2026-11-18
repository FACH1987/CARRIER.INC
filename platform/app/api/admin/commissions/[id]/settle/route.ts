import { AuthError, authFailure, currentAccount } from '../../../../../../lib/account-auth';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const account = await currentAccount(request);
    if (!account) throw new AuthError('Inicia sesión para acceder al historial.', 401);
    if (!account.isAdmin) throw new AuthError('Solo el administrador puede acceder al historial.', 403);
    throw new AuthError('El historial de comisiones es de solo lectura.', 410);
  } catch (error) { return authFailure(error); }
}
