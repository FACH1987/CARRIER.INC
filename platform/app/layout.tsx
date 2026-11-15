import type { Metadata } from 'next';
export const metadata: Metadata = { title: 'Carrier.INC Nicaragua | Güegüense Digital', description: 'Cargas compartidas para empresas y transportistas en Nicaragua.' };
export default function RootLayout({children}: {children: React.ReactNode}) { return <html lang="es"><body>{children}</body></html>; }
