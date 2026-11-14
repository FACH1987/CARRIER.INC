import { currentAccount, responseJson, AuthError, authFailure } from '../../../../lib/account-auth';
import { integrationStatus } from '../../../../lib/mobile-providers';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  try {
    const account = await currentAccount(request);
    if (!account) throw new AuthError('Inicia sesión.', 401);
    if (!account.isAdmin) throw new AuthError('Solo el administrador.', 403);
    return responseJson({ status: integrationStatus(), requiredKeys: { sms: ['TWILIO_ACCOUNT_SID','TWILIO_AUTH_TOKEN','TWILIO_VERIFY_SERVICE_SID','TWILIO_SMS_FROM','MOBILE_JOB_TOKEN'], ocr: ['OCR_AZURE_ENDPOINT','OCR_AZURE_KEY'] }, unattendedDispatch: 'Requiere programar el endpoint privado y recorrer sus cursores. No se ha activado una programación.', issuerVerification: false });
  } catch (error) { return authFailure(error); }
}
