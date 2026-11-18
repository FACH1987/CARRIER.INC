# Carrier.INC Nicaragua

Aplicación web con API de cargas compartidas y Cloudflare D1.

## Suscripciones por transferencia

Desde **Planes → Gestionar suscripción**, la cuenta genera una referencia por mensualidad. El administrador consulta los abonos desde esa misma pantalla y verifica la referencia bancaria y el importe en USD. La primera mensualidad empieza al verificar el abono. Una renovación anticipada comienza al vencer el período vigente.

Configurar `SUBSCRIPTION_BANK_ACCOUNT` en Sites con un objeto JSON que contenga `bank`, `holder`, `number`, `type` (`ahorro` o `corriente`) y `currency: "USD"`. Sin esa cuenta, la app no emite referencias de cobro. La verificación registra la vigencia del plan. Los cupos y beneficios anunciados en el catálogo requieren su implementación correspondiente.

## Ubicación, comprobantes y soporte

La publicación puede incluir coordenadas de recogida para mostrarlas en el mapa a usuarios registrados. El transportista activa los avisos de cercanía desde el tablero. Su ubicación se compara en el navegador con las cargas destacadas y VIP en un radio de 5 km. El sonido de las cargas VIP requiere que el navegador permita audio y que el tablero esté abierto y visible.

Las cargas publicadas con Corporativo incluyen el GPS y la firma del receptor. El GPS requiere que el transportista asignado autorice y mantenga abierta la página del viaje. Se conserva la última posición, visible para las partes del viaje, y se retira al detener el envío o reportar la entrega. El mapa usa OpenStreetMap cuando se abre. La firma se adjunta al expediente privado con el nombre y la autorización del receptor.

El administrador responde desde **Soporte**. Negocio tiene prioridad en la bandeja y Corporativo tiene el nivel más alto. Configurar `SUPPORT_EXECUTIVE` con el nombre del ejecutivo designado de Corporativo. La atención se realiza en el chat de la app.

## Desarrollo

- `npm ci`
- `npm run db:generate` únicamente al cambiar el esquema
- `npm run build`
- Aplicar las migraciones locales pendientes con Wrangler D1 en `.wrangler/state`.
- `npm run dev`

El hosting Sites aplica las migraciones de producción durante el despliegue. Las bases de datos local y de producción son independientes.

Las cargas solo pueden consultarse con una cuenta de empresa o transportista y una sesión iniciada. Publicarlas requiere una cuenta de Carrier.INC con correo y contraseña. Las consultas, cotizaciones y asignaciones se coordinan en **Mis chats**. Las publicaciones y cotizaciones omiten el correo y teléfono de las partes. No se importan los datos del almacenamiento local del prototipo.

Web: [Carrier.INC Nicaragua](https://carrierinc.gueguensedigital.com).

Identidad visual: Carrier.INC por Güegüense Digital, con azul marino, azul eléctrico y celeste.

Las cuentas propias se documentan en `docs/accounts.md`. Para probarlas, compila con `npm run build` y ejecuta `npm run test:accounts` en un entorno temporal aislado. La verificación y recuperación de correo aún no están configuradas.

Gestión de publicaciones: inicia sesión y usa **Mis cargas** para ver todas tus cargas, incluidas las vencidas. El botón **Eliminar** pide confirmación y borra definitivamente solo una carga de la cuenta autenticada.

El registro permite elegir Empresa o Transportista. La API no entrega cargas ni contactos a visitantes sin sesión. Las cuentas anteriores conservan su acceso y se clasifican como Empresa por defecto.

Administración: la cuenta autorizada dispone del botón **Usuarios**, con búsqueda, filtros por tipo y fecha de registro. El acceso se vincula al identificador de la cuenta en el servidor; no se muestran contraseñas. Véase `platform/docs/admin.md` (desde la raíz).

El panel identifica el correo del administrador y ofrece **Eliminar** para las demás cuentas. La confirmación informa que el borrado de la cuenta y sus cargas es definitivo.
