# Teléfonos y notificaciones por SMS

Estado de esta versión: registro de teléfonos y avisos dentro de la app funcionales. Integración Twilio preparada, **sin activar**, porque el propietario todavía no dispone de esas cuentas. No se enviaron SMS ni documentos reales a servicios externos durante el desarrollo. No hay programación de envíos activa.

## Registro y privacidad

Los nuevos transportistas, independientes o de flota, deben registrar un teléfono de Nicaragua. Se normaliza a `+505` y ocho dígitos. La forma válida no acredita titularidad ni capacidad de recibir SMS. Los usuarios anteriores conservan su acceso y pueden añadirlo desde Mi expediente. No se publica el teléfono en el tablero ni en el directorio de usuarios.

Las preferencias permiten cargas nuevas, documentos o ninguna. Para envíos externos se requieren consentimiento, canal SMS y confirmación con un código de Twilio Verify. No se aceptan marcas de verificación enviadas por el navegador. Cambiar el número elimina la verificación previa; retirar el consentimiento o desmarcar una preferencia evita nuevos envíos. Guardar el número con los proveedores desconectados no activa mensajes ni genera códigos ficticios.

## Activación futura de SMS

1. Crear y verificar una cuenta de [Twilio](https://www.twilio.com/try-twilio). Configurar un remitente SMS admitido para enviar a Nicaragua y habilitar sus permisos geográficos. Crear un servicio Verify. Confirmar disponibilidad, tarifas, saldo y restricciones de prueba con Twilio antes de activar tráfico.
2. Guardar como secretos del servidor de Sites: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_VERIFY_SERVICE_SID`, `TWILIO_SMS_FROM` y un `MOBILE_JOB_TOKEN` aleatorio de al menos 32 caracteres. No ponerlos en GitHub, en el navegador ni en mensajes de chat.
3. Programar un ejecutor de confianza que haga POST al endpoint privado `/api/internal/mobile-dispatch` con `Authorization: Bearer <MOBILE_JOB_TOKEN>`, y siga `nextCursor` hasta recibir null. Ejecutarlo periódicamente (por ejemplo, cada cinco minutos) para detectar cargas y cambios de tramo de vencimiento incluso con la web cerrada. Antes de programarlo, probar una entrega autorizada y verificar el estado en Twilio. Esta versión no ha creado ese ejecutor ni ha verificado entregas reales.

Cada llamada procesa hasta tres cuentas y tres eventos nuevos por cuenta. Las siguientes ejecuciones continúan con eventos pendientes. Los eventos se deduplican por cuenta, teléfono y carga o documento/tramo; una renovación cambia el evento. Los estados `sending`/`needs_review` no se reintentan automáticamente si la aceptación fue incierta. `provider_accepted` solo significa aceptado por Twilio, **no entregado al teléfono**; no hay callback de confirmación de entrega en esta versión. Revisar incidencias antes de reintentar manualmente. Las bajas por STOP se aplican además mediante las funciones del proveedor; las preferencias de la app son el control directo del usuario.

Los SMS de carga incluyen origen, destino, fecha, equipo, peso, flete, empresa y correo del anunciante, además de enlace al tablero. Solo se seleccionan las 50 publicaciones más recientes de los últimos siete días, posteriores al registro del receptor, aún disponibles y compatibles con un vehículo cuyo expediente cubra la fecha de recogida. No se envían cargas propias, expiradas o ya asignadas. Los avisos de documentos siguen los tramos 30/15/7/1 día, hoy y vencidos, aun si esa cuenta tiene temporalmente bloqueadas nuevas cargas. Los SMS largos pueden facturarse en varios segmentos.

## Comprobaciones

Las pruebas usan D1/R2 en memoria, números sintéticos y proveedores desconectados. Comprueban el formato, consentimiento, privacidad, rechazo de envíos sin credenciales y avisos de cargas. La entrega real requiere conectar Twilio y ejecutar la programación.
