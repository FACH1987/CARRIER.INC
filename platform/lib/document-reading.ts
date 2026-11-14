export function foldText(text: string) { return text.normalize('NFD').replace(/\p{M}/gu, '').toUpperCase(); }
function normalizedDate(value: string) {
  const iso = value.match(/^(\d{4})[-/](\d{2})[-/](\d{2})$/);
  const local = value.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (!iso && !local) return null;
  const day = iso ? `${iso[1]}-${iso[2]}-${iso[3]}` : `${local![3]}-${local![2].padStart(2, '0')}-${local![1].padStart(2, '0')}`;
  return !Number.isNaN(Date.parse(day + 'T12:00:00Z')) && new Date(day + 'T12:00:00Z').toISOString().slice(0, 10) === day ? day : null;
}
export function readDocumentText(text: string, expected: { type: string; issuedAt: string | null; expiresAt: string | null; noExpiry: boolean; name?: string | null; plate?: string | null; categories?: string[] }) {
  const normalized = foldText(text.slice(0, 100000));
  const dateAfter = (labels: string) => {
    const matches = [...normalized.matchAll(new RegExp(`(?:${labels})[\\s:.-]{0,15}((?:\\d{4}[-/]\\d{2}[-/]\\d{2})|(?:\\d{1,2}[-/.]\\d{1,2}[-/.]\\d{4}))`, 'g'))].map(match => normalizedDate(match[1])).filter((value): value is string => Boolean(value));
    return [...new Set(matches)];
  };
  const issued = dateAfter('EMISION|EXPEDICION|EMITIDO|FECHA DE INICIO|INICIO DE VIGENCIA');
  const expires = dateAfter('VENCIMIENTO|VENCE|EXPIRA|EXPIRACION|VALIDO HASTA|FIN DE VIGENCIA|FINALIZACION');
  const lines = normalized.split('\n');
  const categoryLines = lines.flatMap((line, i) => /CATEGORI/.test(line) ? [line, lines[i+1] || ''] : []).join(' ');
  const foundCategories = [...new Set([...categoryLines.matchAll(/(?:^|[^A-Z0-9])([456]\s*A|3|7)(?=$|[^A-Z0-9])/g)].map(match => match[1].replace(/\s/g, '')))];
  const compact = normalized.replace(/[^A-Z0-9]/g, '');
  const findings: Array<{ field: string; state: 'matches' | 'inconsistent' | 'inconclusive'; message: string }> = [];
  const compareDate = (field: string, values: string[], wanted: string | null) => {
    if (!wanted) return;
    findings.push({ field, state: values.length !== 1 ? 'inconclusive' : values[0] === wanted ? 'matches' : 'inconsistent', message: values.length !== 1 ? 'No se identificó una fecha única con su etiqueta.' : values[0] === wanted ? 'Coincide con la fecha registrada.' : 'La fecha leída no coincide con la registrada.' });
  };
  compareDate('Emisión', issued, expected.issuedAt);
  if (!expected.noExpiry) compareDate('Vencimiento', expires, expected.expiresAt);
  if (expected.plate) findings.push({ field: 'Placa', state: compact.includes(foldText(expected.plate).replace(/[^A-Z0-9]/g, '')) ? 'matches' : 'inconclusive', message: 'Comprobación de presencia de la placa registrada en el texto legible.' });
  if (expected.name) {
    const parts = foldText(expected.name).split(/\s+/).filter(part => part.length > 2);
    findings.push({ field: 'Titular', state: parts.length && parts.every(part => normalized.includes(part)) ? 'matches' : 'inconclusive', message: 'Comparación textual del nombre registrado; no confirma identidad.' });
  }
  if (expected.type === 'license' && expected.categories?.length) findings.push({ field: 'Categorías', state: foundCategories.length && expected.categories.every(category => foundCategories.includes(category)) ? 'matches' : 'inconclusive', message: 'Comparación de las categorías legibles con las registradas; no se presume equivalencia.' });
  const state = findings.some(finding => finding.state === 'inconsistent') ? 'inconsistent' : normalized.trim().length < 20 || !findings.length || findings.some(finding => finding.state === 'inconclusive') ? 'inconclusive' : 'matches';
  return { state, findings, extracted: { issuedAt: issued, expiresAt: expires, categories: foundCategories }, authenticity: 'not_verified', legalCompliance: 'not_certified', issuerVerification: false, scope: 'Lectura OCR y coincidencia de datos. No confirma autenticidad, vigencia ante el emisor ni cumplimiento legal completo.', pageLimit: 5 };
}
