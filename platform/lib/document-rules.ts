export const RULESET = 'NI-431-2026-11-14';
export const legalSources = [
  { title: 'Ley 431 · arts. 62, 63, 79, 140 y 141', url: 'https://superintendencia.gob.ni/sites/default/files/documentos/leyes/ley_431_y_sus_reformas.pdf' },
  { title: 'Policía Nacional · categorías para transporte de carga', url: 'https://tramitesenlinea.policia.gob.ni/DocT/Transporte.aspx' }
];
export function dayInNicaragua(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Managua', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  return ['year', 'month', 'day'].map(key => parts.find(part => part.type === key)!.value).join('-');
}
export function validDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value + 'T12:00:00Z')) && new Date(value + 'T12:00:00Z').toISOString().slice(0, 10) === value;
}
export function addYears(day: string, years: number) {
  const [year, month, date] = day.split('-').map(Number);
  const last = new Date(Date.UTC(year + years, month, 0)).getUTCDate();
  return `${year + years}-${String(month).padStart(2, '0')}-${String(Math.min(date, last)).padStart(2, '0')}`;
}
export function daysBetween(day: string, end: string) { return Math.round((Date.parse(end + 'T00:00:00Z') - Date.parse(day + 'T00:00:00Z')) / 86400000); }
export function reminderStage(days: number | null) {
  if (days === null || days > 30) return null;
  return days < 0 ? 'expired' : days === 0 ? 'today' : days <= 1 ? '1' : days <= 7 ? '7' : days <= 15 ? '15' : '30';
}
export type DocumentInput = { type: string; status?: string; objectKey?: string | null; size?: number | null; issuedAt?: string | null; expiresAt?: string | null; noExpiry?: boolean; exemption?: string | null; ocrStatus?: string; ocrSummary?: string | null };
export function documentDateError(type: string, issuedAt: string, expiresAt: string | null, noExpiry: boolean, day: string) {
  if (!validDate(issuedAt) || issuedAt > day) return 'La fecha de emisión debe ser válida y no futura.';
  if (noExpiry) return ['identity', 'circulation', 'ruc', 'company_registration'].includes(type) ? null : 'Este documento necesita fecha de vencimiento.';
  if (!expiresAt || !validDate(expiresAt) || expiresAt < issuedAt) return 'Revisa la fecha de vencimiento y su orden respecto de la emisión.';
  if (type === 'license' && expiresAt > addYears(issuedAt, 5)) return 'La vigencia declarada de la licencia nacional supera cinco años. Revisa las fechas del documento (Ley 431, art. 140).';
  if (type === 'emissions' && expiresAt > addYears(issuedAt, 1)) return 'La vigencia declarada del certificado de emisiones supera un año. Revisa sus fechas (Ley 431, art. 62).';
  return null;
}
export function evaluateDocument(doc: DocumentInput | undefined, day: string) {
  if (!doc) return { valid: false, state: 'missing', reason: 'Falta subir este documento.', daysLeft: null };
  if (doc.status === 'rejected') return { valid: false, state: 'correction', reason: 'El documento requiere corrección.', daysLeft: null };
  if (doc.ocrStatus === 'completed' && doc.ocrSummary) {
    try { if (JSON.parse(doc.ocrSummary).state === 'inconsistent') return { valid: false, state: 'content_mismatch', reason: 'La lectura del archivo encontró fechas distintas de las registradas. Corrige y vuelve a subir el documento.', daysLeft: null }; } catch { return { valid: false, state: 'invalid', reason: 'El resultado de lectura requiere actualización.', daysLeft: null }; }
  }
  if (doc.exemption) return { valid: true, state: 'declared_exemption', reason: 'No aplicabilidad declarada por el operador.', daysLeft: null };
  if (!doc.objectKey || !doc.size) return { valid: false, state: 'missing', reason: 'Falta el archivo del documento.', daysLeft: null };
  const error = documentDateError(doc.type, doc.issuedAt || '', doc.expiresAt || null, Boolean(doc.noExpiry), day);
  if (error) return { valid: false, state: 'invalid', reason: error, daysLeft: null };
  if (doc.noExpiry) return { valid: true, state: 'no_printed_expiry', reason: 'Documento declarado sin vencimiento impreso.', daysLeft: null };
  const daysLeft = daysBetween(day, doc.expiresAt!);
  return { valid: daysLeft >= 0, state: daysLeft < 0 ? 'expired' : daysLeft <= 30 ? 'expiring' : 'current', reason: daysLeft < 0 ? 'Documento vencido. Renueva para volver a recibir cargas.' : daysLeft === 0 ? 'Vence hoy. Renueva para evitar el bloqueo de nuevos viajes mañana.' : daysLeft <= 30 ? `Vence en ${daysLeft} día(s). Renueva antes de su vencimiento.` : 'Archivo cargado con fechas vigentes.', daysLeft };
}
// Only corroborated boundaries are enforced. No category hierarchy is assumed.
export function vehicleCategoryError(required: string, held: string[], capacityKg: number, equipment: string) {
  if (!held.includes(required)) return 'La categoría requerida por el vehículo no figura entre las declaradas por el conductor (Ley 431, art. 141).';
  if (equipment === 'Cabezal' && !['6A', '7'].includes(required)) return 'El cabezal articulado requiere una categoría habilitante para articulados; revisa la licencia y la categoría declarada.';
  if (required === '3' && capacityKg > 3500) return 'La categoría 3 declarada no corresponde a un vehículo liviano de hasta 3,500 kg.';
  if (required === '4A' && capacityKg > 8000) return 'La categoría 4A declarada no corresponde a una unidad de más de 8,000 kg. Revisa la categoría de la licencia.';
  return null;
}
