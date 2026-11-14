# Teléfonos, SMS y lectura de documentos

Estado de esta versión: registro de teléfonos y avisos dentro de la app funcionales. Integraciones Twilio/Azure preparadas, **sin activar**, porque el propietario todavía no dispone de esas cuentas. No se enviaron SMS ni documentos reales a servicios externos durante el desarrollo. No hay programación de envíos activa.

## Registro y privacidad

Los nuevos transportistas, independientes o de flota, deben registrar un teléfono de Nicaragua. Se normaliza a `+505` y ocho dígitos. La forma válida no acredita titularidad ni capacidad de recibir SMS. Los usuarios anteriores conservan su acceso y pueden añadirlo desde Mi expediente. No se publica el teléfono en el tablero ni en el directorio de usuarios.

Las preferencias permiten cargas nuevas, documentos o ninguna. Para envíos externos se requieren consentimiento, canal SMS y confirmación con un código de Twilio Verify. No se aceptan marcas de verificación enviadas por el navegador. Cambiar el número elimina la verificación previa; retirar el consentimiento o desmarcar una preferencia evita nuevos envíos. Guardar el número con los proveedores desconectados no activa mensajes ni genera códigos ficticios.

## Activación futura de SMS

1. Crear y verificar una cuenta de [Twilio](https://www.twilio.com/try-twilio). Configurar un remitente SMS admitido para enviar a Nicaragua y habilitar sus permisos geográficos. Crear un servicio Verify. Confirmar disponibilidad, tarifas, saldo y restricciones de prueba con Twilio antes de activar tráfico.
2. Guardar como secretos del servidor de Sites: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_VERIFY_SERVICE_SID`, `TWILIO_SMS_FROM` y un `MOBILE_JOB_TOKEN` aleatorio de al menos 32 caracteres. No ponerlos en GitHub, en el navegador ni en mensajes de chat.
3. Programar un ejecutor de confianza que haga POST al endpoint privado `/api/internal/mobile-dispatch` con `Authorization: Bearer <MOBILE_JOB_TOKEN>`, y siga `nextCursor` hasta recibir null. Ejecutarlo periódicamente (por ejemplo, cada cinco minutos) para detectar cargas y cambios de tramo de vencimiento incluso con la web cerrada. Antes de programarlo, probar una entrega autorizada y verificar el estado en Twilio. Esta versión no ha creado ese ejecutor ni ha verificado entregas reales.

Cada llamada procesa hasta tres cuentas y tres eventos nuevos por cuenta. Las siguientes ejecuciones continúan con eventos pendientes. Los eventos se deduplican por cuenta, teléfono y carga o documento/tramo; una renovación cambia el evento. Los estados `sending`/`needs_review` no se reintentan automáticamente si la aceptación fue incierta. `provider_accepted` solo significa aceptado por Twilio, **no entregado al teléfono**; no hay callback de confirmación de entrega en esta versión. Revisar incidencias antes de reintentar manualmente. Las bajas por STOP se aplican además mediante las funciones del proveedor; las preferencias de la app son el control directo del usuario.

Los SMS de carga incluyen origen, destino, fecha, equipo, peso, flete, empresa y correo del anunciante, además de enlace al tablero. Solo se seleccionan las 50 publicaciones más recientes de los últimos siete días, posteriores al registro del receptor, aún disponibles y compatibles con un vehículo cuyo expediente cubra la fecha de recogida. No se envían cargas propias, expiradas o ya asignadas. Los avisos de documentos siguen los tramos 30/15/7/1 día, hoy y vencidos, aun si esa cuenta tiene temporalmente bloqueadas nuevas cargas. Los SMS largos pueden facturarse en varios segmentos.

## Lectura de fotos y PDF

Preparada con [Azure Document Intelligence, modelo Read](https://learn.microsoft.com/en-us/azure/ai-services/document-intelligence/concept-read?view=doc-intel-4.0.0), API `2024-11-30`. Para activarla, crear el recurso y guardar `OCR_AZURE_ENDPOINT` y `OCR_AZURE_KEY` como secretos del servidor. Solo se admiten endpoints HTTPS del servicio Azure, nunca URLs suministradas por usuarios.

El titular autoriza el envío de cada archivo al proveedor; el administrador puede ver el resultado guardado pero no iniciar una transmisión externa en su nombre. El servidor obtiene el archivo de R2 y lo envía de forma privada, sin URL pública. Se leen **como máximo las primeras cinco páginas**, no el documento entero si tiene más. Se extrae texto y se contrastan fechas numéricas etiquetadas (emisión/vencimiento), categorías legibles de licencia, presencia de nombre y placa. No se guarda el texto completo: solo resultados y campos extraídos. El proveedor conserva sus propios resultados según sus condiciones; revisar sus términos antes de procesar documentación personal.

Los resultados son coincidencia, inconcluso o discrepancia. Una fecha leída distinta de la registrada bloquea ese documento hasta corregirlo; no se modifica la fecha automáticamente. Nombres abreviados, fechas en otros formatos, texto borroso o campos ambiguos pueden quedar inconclusos. Renovar elimina el resultado anterior, y una lectura iniciada no puede aplicarse a una versión reemplazada. Se limita la iniciación a diez lecturas por cuenta y hora para controlar consumo.

**OCR no certifica autenticidad ni cumplimiento legal completo.** No valida firmas, sellos, registros de Policía/MTI, aseguradoras, sanciones, propiedad efectiva ni requisitos de todas las modalidades. `authenticity: not_verified`, `legalCompliance: not_certified` e `issuerVerification: false` lo indican expresamente. Una integración con emisores oficiales o una revisión especializada sigue siendo necesaria para esa garantía. La app no cambia estos valores por tener texto coincidente.

## Comprobaciones

Las pruebas usan D1/R2 en memoria, números y documentos sintéticos y proveedores desconectados: validan formatos, consentimiento, privacidad, bloqueo sin credenciales, comparaciones OCR y avisos de cargas. Las conexiones reales de SMS y Azure quedan pendientes de cuentas, secretos, configuración y prueba autorizada. El panel del administrador muestra su estado sin revelar secretos.
