export const customerTypes = ['particular', 'comercio', 'empresa'] as const;
export const loadVisibilities = ['estandar', 'destacada', 'vip'] as const;

export function customerTypeFor(type: typeof customerTypes[number] | null, publisherRole: string | null) {
  return type ?? (publisherRole === 'empresa' ? 'empresa' : 'particular');
}
