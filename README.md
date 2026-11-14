# RutaCarga Nicaragua · Plataforma compartida

La aplicación de producción está en `platform/`. Usa una API y Cloudflare D1 para compartir las cargas entre dispositivos. El archivo `index.html` de la raíz abre la web publicada para ingresar y consultar datos reales.

- Consulta de cargas vigentes solo con sesión iniciada, filtros y actualización cada 30 segundos.
- Cuentas propias con correo y contraseña para publicar.
- Datos validados en el servidor y consultas parametrizadas.
- El correo del anunciante solo es visible para usuarios con sesión iniciada, con consentimiento al publicar.
- Hasta 10 publicaciones por usuario cada 24 horas.
- No se incluyen cargas ni valores de demostración.

## Desarrollo

Desde `platform/`, instala dependencias con `npm ci` y arranca con `npm run dev`. La base de datos local requiere aplicar las migraciones de `platform/drizzle/`; no es la base de datos de producción.

## Alojamiento

El proyecto de Sites y la conexión D1 se declaran en `platform/.openai/hosting.json`. Enlace de la web: [RutaCarga Nicaragua](https://rutacarga-nicaragua.green-sky-5486.chatgpt.site).

## Base de datos elegida

Se mantiene Cloudflare D1 como base de datos activa. Supabase queda como una opción futura; el [paquete de preparación](platform/supabase/README.md) incluye el esquema completo, conversión sin conexión y continuidad de cuentas, documentos, comisiones y SMS. No activar la migración ni configurar una suscripción para ella hasta que el usuario decida retomarla.

Identidad visual: RutaCarga por Güegüense Digital, con azul marino, azul eléctrico y celeste.

Gestión de publicaciones: inicia sesión y usa **Mis cargas** para ver todas tus cargas, incluidas las vencidas. El botón **Eliminar** pide confirmación y borra definitivamente solo una carga de la cuenta autenticada.

El registro permite elegir Empresa o Transportista. La API no entrega cargas ni contactos a visitantes sin sesión. Las cuentas anteriores conservan su acceso y se clasifican como Empresa por defecto.

Administración: la cuenta autorizada dispone del botón **Usuarios**, con búsqueda, filtros por tipo y fecha de registro. El acceso se vincula al identificador de la cuenta en el servidor; no se muestran contraseñas. Véase `platform/docs/admin.md` (desde la raíz).

El panel identifica el correo del administrador y ofrece **Eliminar** para las demás cuentas sin operaciones protegidas. Las cargas asignadas y el historial financiero impiden eliminar las cuentas involucradas.

Comisiones: la empresa acepta un 10% adicional al flete. Al confirmar la finalización, se genera una comisión pendiente. El administrador registra manualmente los pagos recibidos con su referencia desde **Comisiones**. El sistema no transfiere dinero. Consulta [el flujo y sus límites](platform/docs/commissions.md).

Transportistas: el alta continúa en **Mi expediente**, con documentos privados de operador, conductores y vehículos. El acceso se habilita automáticamente con los documentos requeridos y fechas vigentes, sin aprobación manual. Soporta independientes y flotas; consulta [los controles y la configuración local](platform/docs/carrier-documents.md).

El centro **Avisos** recuerda vencimientos a 30, 15, 7 y 1 día dentro de la app. Las unidades con documentos vencidos pierden acceso a nuevas cargas hasta renovar. La evaluación automática comprueba archivos presentes, fechas declaradas y compatibilidad básica de categorías; no autentica el contenido de las copias ni sustituye la validación ante las autoridades.

Los transportistas pueden registrar y confirmar su teléfono y autorizar avisos por SMS de cargas compatibles y vencimientos. La integración con Twilio requiere configurar credenciales y programación de envíos. Consulta [activación y privacidad de SMS](platform/docs/mobile-and-reading.md).
