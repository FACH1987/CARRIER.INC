# Expedientes privados de transportistas

D1 guarda metadatos y R2 guarda archivos privados mediante el binding lógico `DOCUMENTS`. No copiar documentos a `public/`, GitHub ni al repositorio. La publicación provisiona el almacenamiento privado; los datos y archivos locales no se transfieren a producción.

El alta crea una cuenta y lleva a `/carrier.html`. El registro operativo se habilita automáticamente al subir los documentos requeridos del operador, conductor y al menos una unidad, con fechas vigentes. No requiere aprobación del administrador. También se aplica a archivos anteriormente pendientes. El sistema comprueba presencia, formato y fechas declaradas; no certifica autenticidad.

- Independiente: identificación del operador, un conductor y un vehículo.
- Flota: identificación del representante, RUC, registro y autorización aplicable del operador; hasta 50 conductores y 50 vehículos con expedientes separados. Las unidades incompletas no se ofrecen para asignación.
- Conductor: identificación, licencia con categorías declaradas y seguro de licencia.
- Vehículo: circulación, seguro, inspección, emisiones, rodamiento, pesos y dimensiones y autorización de operación aplicable. La categoría 7 añade un permiso específico a la lista de control.

El operador debe tener autorización para aportar los datos de sus conductores. Cada archivo puede ser PDF, PNG o JPG de hasta 5 MB; se limita su tamaño en streaming y se comprueba la cabecera del formato. No hay OCR, antivirus, validación criptográfica ni conexión a registros de Policía/MTI/aseguradoras. La categoría requerida debe coincidir con una categoría declarada por el conductor. El transportista declara titularidad, datos y aplicabilidad de permisos; no se afirma que una carga de archivos constituya certificación legal.

Fechas de emisión y vencimiento se validan en servidor. Identificación, circulación, RUC y registro admiten declaración de ausencia de vencimiento impreso. Documentos cuya aplicabilidad depende del servicio admiten una declaración motivada de no aplicabilidad, sin espera de aprobación. Este es un control de admisión de Carrier.INC; no una lista universal de obligaciones legales.

El administrador conserva una revisión opcional que registra fecha, observación y revisión exacta del archivo. Puede solicitar correcciones rechazando un documento, lo que bloquea la unidad hasta su corrección. Una renovación vigente habilita de nuevo la unidad automáticamente y elimina la revisión anterior. El estado interno `pending` significa que no hay revisión manual; ya no es un bloqueo de acceso. No se puede aprobar una copia reemplazada ni un documento vencido. Los originales siguen siendo privados: únicamente el titular y el administrador pueden descargarlos con sesión, como adjuntos y sin caché. Las empresas reciben solo unidades elegibles y los datos de la unidad/conductor asignados, sin distintivos de autenticidad verificada.

La vigencia se calcula cada vez que se consulta el expediente o se decide una asignación/aceptación, usando Nicaragua. Para asignar o aceptar, los documentos deben cubrir al menos la fecha de recogida; se exige equipo compatible y capacidad suficiente. Los viajes ya iniciados permiten reportar entrega y cierre aun si un documento vence, para conservar su trazabilidad y las comisiones; no se habilitan nuevos viajes. No se estima la fecha de llegada del viaje.

## Evaluación automática y avisos dentro de la app

Reglas versionadas en `lib/document-rules.ts`: fechas válidas y en orden, emisión no futura, archivo presente, rechazo de documentos vencidos, máximo declarado de cinco años para licencia nacional (Ley 431, art. 140), máximo de un año para certificado de emisiones (art. 62), categoría del vehículo presente entre las declaradas por el conductor y controles básicos de incompatibilidad de carga/configuración. Se aplican límites corroborados para categorías 3 y 4A y se rechazan cabezales declarados con una categoría no habilitante para articulados. No se presume que una categoría superior incluya todas las inferiores ni se implementa una tabla exhaustiva de homologaciones.

La base normativa publicada por SIBOIF es el texto de 2014 con reformas incorporadas. Se consultaron también las categorías de carga publicadas por la Policía Nacional. Estas comprobaciones no equivalen a un dictamen integral de cumplimiento legal actual: otras reformas, servicios especializados/internacionales, restricciones individuales y aplicabilidad de permisos requieren evaluación específica. Los umbrales de los avisos y el bloqueo de acceso son políticas de Carrier.INC.

El centro **Avisos** aparece en las cargas y en Mi expediente. Presenta recordatorios cuando restan hasta 30, 15, 7 o 1 día, además del día del vencimiento y documentos vencidos. Si el usuario no entra un día exacto, recibe el aviso del tramo vigente al volver. Se comprueba al abrir la app, recuperar el foco, actualizar documentos y cada 60 segundos mientras está visible. No hay correo, push, tarea nocturna ni avisos cuando la app está cerrada. El bloqueo en servidor no depende de que el usuario abra o lea un aviso.

Las alertas se calculan sobre el expediente actual. D1 guarda solo qué avisos leyó el usuario, asociados a su documento, revisión y tramo de vencimiento. Una nueva etapa vuelve a avisar; renovar elimina la alerta obsoleta. Leer un aviso no renueva, desbloquea ni altera fechas. Las unidades vencidas de una flota no reciben nuevas asignaciones; las unidades con expediente completo y vigente pueden continuar. Si ninguna cumple, se bloquea el tablero de nuevas cargas, conservando acceso al expediente y a los viajes propios para cerrarlos.

La evaluación se basa en metadatos aportados por el usuario. No se ha integrado OCR ni análisis visual de PDF/imágenes ni consultas a registros oficiales: no detecta que el texto del archivo difiera de las fechas o categorías ingresadas. Este límite se muestra en el expediente; no se presenta el resultado como autenticidad verificada.

El transportista puede reemplazar archivos y renovar fechas. Los datos estructurales del operador, conductor y vehículo se fijan al crearlos; su rectificación administrativa y la reasignación de choferes quedan fuera de esta primera versión. Las copias reemplazadas se eliminan del bucket después de guardar la nueva referencia; no se conserva un archivo histórico de versiones. La eliminación de una cuenta sin operaciones protegidas elimina su expediente y sus objetos privados; las cuentas con operaciones asignadas o historial financiero se conservan.

## Fuentes oficiales consultadas (14 de noviembre de 2026)

- [Policía Nacional: trámites y categorías](https://www.policia.gob.ni/?page_id=35601).
- [Material oficial de carga: categorías 4A, 5A, 6A y 7](https://tramitesenlinea.policia.gob.ni/DocT/Transporte.aspx).
- [Ley 431 con reformas incorporadas, publicada por SIBOIF](https://superintendencia.gob.ni/sites/default/files/documentos/leyes/ley_431_y_sus_reformas.pdf), arts. 62, 63, 79, 140 y 141.
- [Norma administrativa complementaria, documento normativo reproducido](https://docs.nicaragua.justia.com/nacionales/normas-tecnicas/norma-administrativa-complementarias-de-la-ley-431-ley-para-el-regimen-de-circulacion-vehicular-e-infracciones-de-transito.pdf), categorías. Su texto histórico contiene ambigüedades para 5A y 6A; no se codifica una tabla completa a partir de ellas.
- [La Gaceta 17, 26/01/2021, digesto de transporte](https://legislacion.asamblea.gob.ni/gacetas/2021/1/g17.pdf). El texto consolidado indica derogaciones; no usar el antiguo artículo 19 del reglamento como lista vigente universal. Los requisitos concretos de operación deben contrastarse con MTI/Policía según el servicio y el equipo.

## Verificación local

`npm run build` / el helper de compilación de Sites prepara el Worker y sus bindings locales. Aplicar la migración `0004_hot_risque.sql` a D1 **local** y ejecutar `npm start`. La base local y su bucket no contienen usuarios ni documentos de producción. `npm run test:accounts` utiliza D1 y R2 en memoria y comprueba privacidad, vencimientos, renovación, revisión, flotas, asignaciones y comisiones sin usar documentos reales.

Para revisar como administrador local: crear primero una cuenta local de empresa con el correo del propietario, ejecutar `npm run local:admin` desde `platform/` y reiniciar `npm start`. Por defecto busca `gueguense09@gmail.com`; también admite un correo como argumento. El comando consulta únicamente D1 local y escribe el identificador inmutable en el archivo ignorado `dist/server/.dev.vars`. No asigna permisos por correo durante el registro ni modifica producción. Repetir después de recompilar, porque `dist/` se regenera.
