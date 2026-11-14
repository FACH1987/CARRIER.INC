# Expedientes privados de transportistas

D1 guarda metadatos y R2 guarda archivos privados mediante el binding lógico `DOCUMENTS`. No copiar documentos a `public/`, GitHub ni al repositorio. La publicación provisiona el almacenamiento privado; los datos y archivos locales no se transfieren a producción.

El alta crea una cuenta y lleva a `/carrier.html`. El registro operativo se habilita automáticamente al subir los documentos requeridos del operador, conductor y al menos una unidad, con fechas vigentes. No requiere aprobación del administrador. También se aplica a archivos anteriormente pendientes. El sistema comprueba presencia, formato y fechas declaradas; no certifica autenticidad.

- Independiente: identificación del operador, un conductor y un vehículo.
- Flota: identificación del representante, RUC, registro y autorización aplicable del operador; hasta 50 conductores y 50 vehículos con expedientes separados. Las unidades incompletas no se ofrecen para asignación.
- Conductor: identificación, licencia con categorías declaradas y seguro de licencia.
- Vehículo: circulación, seguro, inspección, emisiones, rodamiento, pesos y dimensiones y autorización de operación aplicable. La categoría 7 añade un permiso específico a la lista de control.

El operador debe tener autorización para aportar los datos de sus conductores. Cada archivo puede ser PDF, PNG o JPG de hasta 5 MB; se limita su tamaño en streaming y se comprueba la cabecera del formato. No hay OCR, antivirus, validación criptográfica ni conexión a registros de Policía/MTI/aseguradoras. La categoría requerida debe coincidir con una categoría declarada por el conductor. El transportista declara titularidad, datos y aplicabilidad de permisos; no se afirma que una carga de archivos constituya certificación legal.

Fechas de emisión y vencimiento se validan en servidor. Identificación, circulación, RUC y registro admiten declaración de ausencia de vencimiento impreso. Documentos cuya aplicabilidad depende del servicio admiten una declaración motivada de no aplicabilidad, sin espera de aprobación. Este es un control de admisión de RutaCarga; no una lista universal de obligaciones legales.

El administrador conserva una revisión opcional que registra fecha, observación y revisión exacta del archivo. Puede solicitar correcciones rechazando un documento, lo que bloquea la unidad hasta su corrección. Una renovación vigente habilita de nuevo la unidad automáticamente y elimina la revisión anterior. El estado interno `pending` significa que no hay revisión manual; ya no es un bloqueo de acceso. No se puede aprobar una copia reemplazada ni un documento vencido. Los originales siguen siendo privados: únicamente el titular y el administrador pueden descargarlos con sesión, como adjuntos y sin caché. Las empresas reciben solo unidades elegibles y los datos de la unidad/conductor asignados, sin distintivos de autenticidad verificada.

La vigencia se calcula cada vez que se consulta el expediente o se decide una asignación/aceptación, usando Nicaragua. Para asignar o aceptar, los documentos deben cubrir al menos la fecha de recogida; se exige equipo compatible y capacidad suficiente. No hay una tarea nocturna ni avisos automáticos. Los viajes ya iniciados permiten reportar entrega y cierre aun si un documento vence, para conservar su trazabilidad y las comisiones; no se habilitan nuevos viajes. No se estima la fecha de llegada del viaje.

El transportista puede reemplazar archivos y renovar fechas. Los datos estructurales del operador, conductor y vehículo se fijan al crearlos; su rectificación administrativa y la reasignación de choferes quedan fuera de esta primera versión. Las copias reemplazadas se eliminan del bucket después de guardar la nueva referencia; no se conserva un archivo histórico de versiones. La eliminación de una cuenta sin operaciones protegidas elimina su expediente y sus objetos privados; las cuentas con operaciones asignadas o historial financiero se conservan.

## Fuentes oficiales consultadas (14 de noviembre de 2026)

- [Policía Nacional: trámites y categorías](https://www.policia.gob.ni/?page_id=35601).
- [Material oficial de carga: categorías 4A, 5A, 6A y 7](https://tramitesenlinea.policia.gob.ni/DocT/Transporte.aspx).
- [La Gaceta 17, 26/01/2021, digesto de transporte](https://legislacion.asamblea.gob.ni/gacetas/2021/1/g17.pdf). El texto consolidado indica derogaciones; no usar el antiguo artículo 19 del reglamento como lista vigente universal. Los requisitos concretos de operación deben contrastarse con MTI/Policía según el servicio y el equipo.

## Verificación local

`npm run build` / el helper de compilación de Sites prepara el Worker y sus bindings locales. Aplicar la migración `0004_hot_risque.sql` a D1 **local** y ejecutar `npm start`. La base local y su bucket no contienen usuarios ni documentos de producción. `npm run test:accounts` utiliza D1 y R2 en memoria y comprueba privacidad, vencimientos, renovación, revisión, flotas, asignaciones y comisiones sin usar documentos reales.

Para revisar como administrador local: crear primero una cuenta local de empresa con el correo del propietario, ejecutar `npm run local:admin` desde `platform/` y reiniciar `npm start`. Por defecto busca `gueguense09@gmail.com`; también admite un correo como argumento. El comando consulta únicamente D1 local y escribe el identificador inmutable en el archivo ignorado `dist/server/.dev.vars`. No asigna permisos por correo durante el registro ni modifica producción. Repetir después de recompilar, porque `dist/` se regenera.
