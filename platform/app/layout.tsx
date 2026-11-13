import type { Metadata } from 'next';
export const metadata: Metadata = { title: 'RutaCarga Nicaragua', description: 'Cargas compartidas para empresas y transportistas en Nicaragua.' };
export default function RootLayout({children}: {children: React.ReactNode}) { return <html lang="es"><body>{children}</body></html>; }
