# RutaCarga Nicaragua

Aplicación web con API de cargas compartidas y Cloudflare D1.

## Desarrollo

- `npm ci`
- `npm run db:generate` únicamente al cambiar el esquema
- `npm run build`
- Aplicar las migraciones locales pendientes con Wrangler D1 en `.wrangler/state`.
- `npm run dev`

El hosting Sites aplica las migraciones de producción durante el despliegue. Las bases de datos local y de producción son independientes.

Las cargas solo pueden consultarse con una cuenta de empresa o transportista y una sesión iniciada. Publicarlas requiere una cuenta de RutaCarga con correo y contraseña. Los datos de contacto se comparten con usuarios registrados, con consentimiento. No se importan los datos del almacenamiento local del prototipo.

Web: [RutaCarga Nicaragua](https://rutacarga-nicaragua.green-sky-5486.chatgpt.site).

Identidad visual: RutaCarga por Güegüense Digital, con azul marino, azul eléctrico y celeste.

Las cuentas propias se documentan en `docs/accounts.md`. Para probarlas, compila con `npm run build` y ejecuta `npm run test:accounts` en un entorno temporal aislado. La verificación y recuperación de correo aún no están configuradas.

Gestión de publicaciones: inicia sesión y usa **Mis cargas** para ver todas tus cargas, incluidas las vencidas. El botón **Eliminar** pide confirmación y borra definitivamente solo una carga de la cuenta autenticada.

El registro permite elegir Empresa o Transportista. La API no entrega cargas ni contactos a visitantes sin sesión. Las cuentas anteriores conservan su acceso y se clasifican como Empresa por defecto.
