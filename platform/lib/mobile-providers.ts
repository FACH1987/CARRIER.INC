import { env } from 'cloudflare:workers';
import { AuthError } from './account-auth';
type Config = { TWILIO_ACCOUNT_SID?: string; TWILIO_AUTH_TOKEN?: string; TWILIO_VERIFY_SERVICE_SID?: string; TWILIO_SMS_FROM?: string; MOBILE_JOB_TOKEN?: string; OCR_AZURE_ENDPOINT?: string; OCR_AZURE_KEY?: string };
export function providerConfig() { return env as unknown as Config; }
export function integrationStatus() {
  const c = providerConfig(), auth = Boolean(/^AC[a-f0-9]{32}$/i.test(c.TWILIO_ACCOUNT_SID || '') && c.TWILIO_AUTH_TOKEN);
  return { sms: auth && Boolean(/^\+\d{8,15}$/.test(c.TWILIO_SMS_FROM || '') && c.MOBILE_JOB_TOKEN), phoneVerification: auth && Boolean(/^VA[a-f0-9]{32}$/i.test(c.TWILIO_VERIFY_SERVICE_SID || '')), ocr: Boolean(c.OCR_AZURE_KEY && azureEndpoint(c.OCR_AZURE_ENDPOINT || '')) };
}
export function azureEndpoint(value: string) {
  try { const url = new URL(value); return url.protocol === 'https:' && /^[a-z0-9-]+\.(?:cognitiveservices|api\.cognitive)\.azure\.com$/i.test(url.hostname) && !url.username && !url.password && !url.port ? url.origin : null; } catch { return null; }
}
export async function twilioRequest(resource: string, params: Record<string, string>, verify = false) {
  const c = providerConfig();
  if (!/^AC[a-f0-9]{32}$/i.test(c.TWILIO_ACCOUNT_SID || '') || !c.TWILIO_AUTH_TOKEN) throw new AuthError('El servicio SMS todavía no está conectado.', 503);
  if (verify && !/^VA[a-f0-9]{32}$/i.test(c.TWILIO_VERIFY_SERVICE_SID || '')) throw new AuthError('La confirmación por SMS todavía no está conectada.', 503);
  const endpoint = verify ? `https://verify.twilio.com/v2/Services/${c.TWILIO_VERIFY_SERVICE_SID}/${resource}` : `https://api.twilio.com/2010-04-01/Accounts/${c.TWILIO_ACCOUNT_SID}/${resource}.json`;
  let response: Response;
  try { response = await fetch(endpoint, { method: 'POST', headers: { Authorization: 'Basic ' + btoa(c.TWILIO_ACCOUNT_SID + ':' + c.TWILIO_AUTH_TOKEN), 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(params), signal: AbortSignal.timeout(15000), redirect: 'error' }); }
  catch { throw new AuthError('No pudimos confirmar la respuesta del proveedor SMS. Revisa el estado antes de reintentar.', 502); }
  if (!response.ok) throw new AuthError('El proveedor SMS no aceptó la solicitud. Revisa la configuración y el número.', 502);
  return await response.json() as { sid?: string; status?: string };
}
