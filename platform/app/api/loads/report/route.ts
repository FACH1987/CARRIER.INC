import { and, desc, eq } from 'drizzle-orm';
import { getDb } from '../../../../db';
import { loads } from '../../../../db/schema';
import { AuthError, authFailure, currentAccount, responseJson } from '../../../../lib/account-auth';
import { activePlan } from '../../../../lib/subscriptions';

export const dynamic = 'force-dynamic';

const escapeMarkup = (value: string | number | null) => String(value ?? '').replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;',
}[character]!));
const headers = ['Fecha de entrega', 'Origen', 'Destino', 'Equipo', 'Importe del flete', 'Moneda'];

export async function GET(request: Request) {
  try {
    const account = await currentAccount(request);
    if (!account) throw new AuthError('Inicia sesión.', 401);
    const plan = await activePlan(account.id);
    if (account.role !== 'empresa' || (plan !== 'negocio' && plan !== 'corporativo')) {
      throw new AuthError('Los reportes están disponibles en Negocio y Corporativo.', 403);
    }
    const format = new URL(request.url).searchParams.get('format');
    if (format !== 'excel' && format !== 'print') return responseJson({ error: 'Selecciona un formato de reporte.' }, 400);
    const rows = await getDb().select({ completedAt: loads.completedAt, origin: loads.origin,
      destination: loads.destination, equipment: loads.equipment, pay: loads.pay, currency: loads.currency })
      .from(loads).where(and(eq(loads.ownerId, `account:${account.id}`), eq(loads.status, 'finalizada')))
      .orderBy(desc(loads.completedAt));
    const data = [headers, ...rows.map(row => [row.completedAt?.slice(0, 10) || '', row.origin, row.destination, row.equipment, row.pay, row.currency])];
    const responseHeaders = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' };
    if (format === 'excel') {
      const sheet = data.map(row => '<Row>' + row.map(value =>
        `<Cell><Data ss:Type="${typeof value === 'number' ? 'Number' : 'String'}">${escapeMarkup(value)}</Data></Cell>`).join('') + '</Row>').join('');
      return new Response(`<?xml version="1.0" encoding="UTF-8"?><?mso-application progid="Excel.Sheet"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Worksheet ss:Name="Fletes"><Table>${sheet}</Table></Worksheet></Workbook>`, {
        headers: { ...responseHeaders, 'Content-Type': 'application/xml; charset=UTF-8', 'Content-Disposition': 'attachment; filename="fletes.xml"' },
      });
    }
    const table = data.map((row, index) => {
      const tag = index === 0 ? 'th' : 'td';
      return '<tr>' + row.map(value => `<${tag}>${escapeMarkup(value)}</${tag}>`).join('') + '</tr>';
    }).join('');
    return new Response(`<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Reporte de fletes · Carrier.INC</title><style>body{font:15px system-ui;margin:2rem;color:#152d52}table{border-collapse:collapse;width:100%}th,td{padding:.6rem;border:1px solid #c9d3e0;text-align:left}@media print{.help{display:none}tr{break-inside:avoid}}</style><h1>Reporte de fletes finalizados</h1><p>Importes acordados por carga.</p><p class="help">Para guardar como PDF, abre la opción Imprimir de tu navegador y selecciona Guardar como PDF.</p><table>${table}</table></html>`, {
      headers: { ...responseHeaders, 'Content-Type': 'text/html; charset=UTF-8', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'" },
    });
  } catch (error) { return authFailure(error); }
}
