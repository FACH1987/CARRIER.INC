# RutaCarga Nicaragua

Aplicación web con API de cargas compartidas y Cloudflare D1.

## Desarrollo

- `npm ci`
- `npm run db:generate` únicamente al cambiar el esquema
- `npm run build`
- Aplicar las migraciones locales pendientes con Wrangler D1 en `.wrangler/state`.
- `npm run dev`

El hosting Sites aplica las migraciones de producción durante el despliegue. Las bases de datos local y de producción son independientes.

Las cargas se consultan públicamente. Publicarlas requiere iniciar sesión con ChatGPT. Los datos de contacto se publican con consentimiento. No se importan los datos del almacenamiento local del prototipo.

Web: [RutaCarga Nicaragua](https://rutacarga-nicaragua.green-sky-5486.chatgpt.site).
