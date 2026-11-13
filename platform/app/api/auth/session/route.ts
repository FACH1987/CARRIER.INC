import { authFailure, currentAccount, responseJson } from '../../../../lib/account-auth';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  try { return responseJson({ user: await currentAccount(request) }); }
  catch (error) { return authFailure(error); }
}
