# Comisiones de Carrier.INC

La empresa que publica acepta una comisión adicional del 10% del flete al publicar o asignar una carga anterior. El transportista conserva el flete completo. Ejemplo: flete C$10,000, comisión C$1,000, total empresa C$11,000. Los cálculos se realizan en centavos de NIO y se redondean al centavo más cercano.

Desde **Mis cargas**, el publicador asigna un transportista por su correo registrado. Este acepta el viaje y reporta la entrega. El publicador confirma la finalización: se genera una sola comisión pendiente, incluso al repetir la solicitud. Antes de aceptar, la asignación puede retirarse o rechazarse sin generar comisión.

La cuenta administradora abre **Comisiones**, consulta pendientes y pagos registrados, y usa **Registrar pago recibido**. Debe introducir una referencia y confirmar que recibió el importe completo de la comisión. Se conservan la fecha, referencia y cuenta que lo registró. Esta operación es un registro manual: no realiza transferencias ni verifica movimientos bancarios. No admite pagos parciales, reversiones ni facturación fiscal automática.

No se crean comisiones retroactivas en las cargas existentes. Requieren aceptación al asignar. Las cargas asignadas y el historial financiero impiden eliminar las cargas y las cuentas involucradas. Las cargas disponibles sin historial pueden eliminarse.

La base activa es D1. La futura migración a Supabase debe incluir usuarios, asignaciones, estados, acuerdos y comisiones antes de activar ese adaptador. Las pruebas utilizan D1 en memoria; no crean cobros ni datos de prueba en producción.
