export function normalizePhone(input: string) {
  const value = input.trim().replace(/[\s()-]/g, '');
  const digits = value.startsWith('+505') ? value.slice(4) : value.startsWith('505') && value.length === 11 ? value.slice(3) : value;
  return /^[2-8]\d{7}$/.test(digits) ? '+505' + digits : null;
}
export function maskPhone(phone: string | null) { return phone ? phone.slice(0, 4) + ' •••• ' + phone.slice(-4) : null; }
