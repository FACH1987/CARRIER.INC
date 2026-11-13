# RutaCarga Nicaragua · Plataforma compartida

La aplicación de producción está en `platform/`. Usa una API y Cloudflare D1 para compartir las cargas entre dispositivos. El archivo `index.html` de la raíz abre la web publicada para ingresar y consultar datos reales.

- Consulta pública de cargas vigentes, filtros y actualización cada 30 segundos.
- Cuentas propias con correo y contraseña para publicar.
- Datos validados en el servidor y consultas parametrizadas.
- El correo del anunciante es público, con consentimiento al publicar.
- Hasta 10 publicaciones por usuario cada 24 horas.
- No se incluyen cargas ni valores de demostración.

## Desarrollo

Desde `platform/`, instala dependencias con `npm ci` y arranca con `npm run dev`. La base de datos local requiere aplicar las migraciones de `platform/drizzle/`; no es la base de datos de producción.

## Alojamiento

El proyecto de Sites y la conexión D1 se declaran en `platform/.openai/hosting.json`. Enlace de la web: [RutaCarga Nicaragua](https://rutacarga-nicaragua.green-sky-5486.chatgpt.site).

## Base de datos elegida

Se mantiene Cloudflare D1 como base de datos activa. Supabase queda como una opción futura; su preparación está en platform/supabase/README.md. No activar la migración ni configurar una suscripción para ella hasta que el usuario decida retomarla.

Identidad visual: RutaCarga por Güegüense Digital, con azul marino, azul eléctrico y celeste.
