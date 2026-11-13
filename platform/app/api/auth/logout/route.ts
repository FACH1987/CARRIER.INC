import { authFailure, endSession, responseJson } from '../../../../lib/account-auth';
export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
  try { return responseJson({ user: null }, 200, await endSession(request)); }
  catch (error) { return authFailure(error); }
}
