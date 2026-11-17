# Cobro anticipado y pago al transportista — diseño pendiente de proveedor

Estado: propuesta local. No implementa cobros, transferencias ni cambios en la publicación de cargas. El sistema actual solo registra comisiones y referencias de pagos manuales.

Decisiones confirmadas: operación de la aplicación en Nicaragua; la empresa que publica confirma la entrega antes de liberar el pago. Falta identificar la cuenta de comercio y el proveedor contratado. Operar en Nicaragua no acredita por sí solo el país de registro legal del comercio.

## Empresa: pagar y publicar

La empresa completa la carga y selecciona el equipo. Antes de publicarla, ve el flete, la comisión adicional vigente del 10% y el total. Se mantiene el acuerdo actual: el transportista recibe el flete completo. Queda por definir quién asume las tarifas del procesador.

El botón «Pagar y publicar» abre el formulario alojado por el proveedor seleccionado. Carrier.INC conserva identificadores del proveedor y un resumen del método; no almacena números completos de tarjeta ni códigos de seguridad.

La carga queda pendiente de pago y no aparece en el tablero hasta que el servidor confirme el cobro mediante un evento verificado del proveedor. Regresar desde el formulario de pago o pulsar «Ya pagué» no acredita un cobro. Un intento fallido permite reintentar sin crear otra carga ni otro cobro confirmado.

El dinero debe estar cobrado al publicar, no depender de que una autorización de tarjeta dure hasta la entrega. La posibilidad de conservar fondos y transferirlos después debe ser parte del servicio contratado con el proveedor. Este diseño no constituye por sí mismo un servicio de depósito en garantía.

## Transportista: configurar dónde recibir

En «Mis cobros», el transportista configura su cuenta de destino y completa la verificación que exija el proveedor, preferentemente en su formulario alojado. Solo se guarda en Carrier.INC la referencia y el estado de habilitación para recibir pagos.

Antes de aceptar una asignación, debe tener un destino de cobro habilitado. El transportista ve el flete acordado y el estado del pago de la empresa, sin acceso a sus datos de tarjeta.

## Entrega y transferencia

El transportista reporta la entrega y la empresa que publicó la carga confirma su recepción. Esa confirmación autoriza el pago; la declaración unilateral del transportista no lo libera. Reportar la entrega y confirmar su recepción son acciones separadas.

Tras la confirmación autorizada, el servidor solicita una sola transferencia del flete al transportista asignado. La comisión de Carrier.INC se concilia con el cobro original; no vuelve a cobrarse manualmente. «Transferencia solicitada» y «Pago completado» son estados distintos y se actualizan con respuestas verificadas del proveedor.

Una cancelación, disputa o devolución pendiente bloquea la transferencia. Deben definirse los plazos para confirmar, la resolución de desacuerdos y la política de cancelación antes de activar cobros reales. El administrador consulta y gestiona incidencias financieras sin operar el viaje como transportista.

## Preparación técnica necesaria

- Separar el estado operativo de la carga de los estados de cobro, devolución y transferencia.
- Añadir registros de cobros, destinos de pago, transferencias y eventos del proveedor, manteniendo referencias únicas e importes en centavos.
- Recalcular importes en el servidor y comprobar importe, moneda, propietario y carga al recibir cada evento.
- Verificar firmas de eventos y procesar notificaciones repetidas o fuera de orden sin duplicar dinero ni retroceder estados finales.
- Usar claves de idempotencia estables para cobros, transferencias y devoluciones. No repetir automáticamente una operación cuyo resultado sea incierto.
- Bloquear asignaciones y publicaciones sin cobro confirmado, y pagos a cuentas ajenas o sin verificación.
- Conservar cargas, cuentas y registros financieros referenciados. Eliminar una publicación no puede borrar un cobro ni sustituir una devolución.
- Ampliar la preparación de Supabase con estas tablas cuando se implemente el esquema definitivo.
- Probar en entorno de pruebas del proveedor: cobro correcto y fallido, entrega confirmada, doble clic, eventos duplicados, fallo de transferencia, devolución y disputa.
- Mantener las cargas anteriores con su flujo histórico; no declararlas pagadas ni cobrar retroactivamente.

## Decisiones necesarias

1. País de registro de Carrier.INC, país de los transportistas y proveedor disponible para cobros y pagos a terceros.
2. Confirmado: la empresa titular de la carga confirma la entrega y autoriza la transferencia.
3. Moneda de cobro y liquidación, tarifas del proveedor, cancelaciones, devoluciones y plazos de confirmación.

Referencias técnicas para evaluar un proveedor, sin seleccionarlo todavía: [disponibilidad de Stripe](https://stripe.com/global), [cobros y transferencias separados](https://docs.stripe.com/connect/separate-charges-and-transfers), [eventos de pago verificados](https://docs.stripe.com/webhooks).

Para Nicaragua, BAC publica opciones de [ventas digitales y Compra-Click](https://www.baccredomatic.com/es-ni/pymes/ventas-digitales). Esto acredita una vía de cobro para comercios afiliados, pero no confirma que el contrato permita conservar fondos de terceros y pagarlos automáticamente tras una entrega. dLocal documenta [pagos a cuentas en Nicaragua](https://docs.dlocal.com/docs/nicaragua-payouts-v3); falta confirmar elegibilidad del comercio y cobertura del flujo completo. No se ha elegido ni activado ninguno.

## Adaptación bancaria solicitada

Sin pasarela contratada, se incorpora el registro privado de la cuenta de origen de cada Empresa y la cuenta de destino de cada Transportista. El administrador puede consultar esos datos; solo el titular los modifica. Esta etapa no cobra antes de publicar, no retiene fondos ni realiza transferencias. Ver [cuentas bancarias](bank-accounts.md).
