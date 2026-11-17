# Preparación de la migración a Supabase (aplazada)

Decisión del usuario: mantener Cloudflare D1 como base de datos activa. La migración a Supabase queda aplazada; estos archivos se conservan como preparación para cuando el usuario decida retomarla.

**No activar `DATABASE_PROVIDER=supabase` todavía.** Las rutas actuales rechazan operaciones con ese valor y `getDb()` sigue conectado a D1. Esta carpeta prepara los datos; el adaptador PostgreSQL de la aplicación debe implementarse y probarse cuando se autorice el cambio. No se ha creado un proyecto, contratado un plan, copiado datos ni activado SMS.

## Archivos preparados

- `schema.sql`: las 13 tablas actuales, índices y relaciones para un destino **vacío**, con RLS y sin permisos para `anon` ni `authenticated`. La API del servidor autoriza las operaciones.
- `prepare.mjs`: genera el esquema desde las migraciones D1 y convierte un volcado SQL D1 propio en INSERT de PostgreSQL sin conexión a servicios. Rechaza tablas de negocio sin mapear, columnas faltantes y referencias rotas. No sobrescribe la salida ni imprime datos personales.
- `../tests/supabase-preparation.test.mjs`: comprueba correspondencia del esquema y conservación de datos SMS, importes y hashes.
- `migrations/202611130001_loads.sql`: preparación histórica de cargas solamente. **No aplicarla junto con `schema.sql`.** Si ya se aplicó, preparar una actualización específica o usar un destino de ensayo vacío; no borrar tablas con datos.

El nuevo esquema conserva identificadores de texto, fechas ISO, categorías y resúmenes JSON como texto, importes en centavos e indicadores D1 como enteros 0/1. Los vencimientos de sesiones y límites son milisegundos en `bigint`. El futuro adaptador debe respetar esos formatos y devolver los indicadores como booleanos de aplicación. Conservar la zona de Nicaragua para evaluar documentos.

## Preparar una copia cuando se autorice

Desde `platform/`, con Node 24 o superior:

```sh
node supabase/prepare.mjs schema
node --test tests/supabase-preparation.test.mjs
```

Detener escrituras y el ejecutor SMS antes del respaldo final. Exportar **toda** D1, incluidas cargas vencidas, cuentas y tablas de control; la API del tablero no es una exportación completa. Guardar los archivos en `supabase/private/`, excluido de Git. El conversor ejecuta el SQL en SQLite en memoria: solo admite exportaciones propias de confianza.

```sh
node supabase/prepare.mjs convert supabase/private/d1-export.sql supabase/private/postgres-data.sql
```

Guardar el resumen de recuentos. En el destino de ensayo, aplicar primero `schema.sql` y después `postgres-data.sql`, con parada ante errores (`psql -v ON_ERROR_STOP=1`). Son transacciones separadas: un fallo de datos deja el esquema vacío. No continuar con una importación parcial ni añadir `ON CONFLICT DO NOTHING`. El conversor no aplica nada a Supabase.

## Cuentas y documentos

En la primera fase se conserva la autenticación propia: copiar `users.password_hash` sin alterar los hashes `scrypt-v1`, mantener el verificador y el identificador de administrador del servidor. **No importar esos hashes a Supabase Auth.** Cambiar a Supabase Auth sería otra migración. Las sesiones se omiten deliberadamente: todos vuelven a iniciar sesión después del cambio. Los límites de autenticación sí se conservan.

Mantener R2 como almacenamiento privado durante el cambio de base. Copiar metadatos conservando `object_key`, revisiones, propietarios, exenciones y resultados de lectura. Mantener el binding `DOCUMENTS` y comprobar descargas y reemplazos con autorización. No publicar el bucket. Pasar a Supabase Storage requeriría otra copia y verificación de objetos; no está incluido aquí.

## Continuidad de SMS

Conservar exactamente `phone`, `phone_verified_at`, `phone_channel`, `notify_loads`, `notify_documents` y `phone_consent_at`. No inventar confirmaciones ni autorizaciones. Copiar los ID de avisos leídos y **todos** los registros de `phone_deliveries`, incluidos `sending`, `provider_accepted` y `needs_review`. Sus ID evitan reenviar eventos ya procesados; aceptación del proveedor no acredita entrega.

Twilio sigue proporcionando SMS aunque la base pase a Supabase. Mantener exclusivamente en el servidor `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_VERIFY_SERVICE_SID`, `TWILIO_SMS_FROM` y `MOBILE_JOB_TOKEN`. Configuración y programación de `/api/internal/mobile-dispatch` quedan pendientes de activación autorizada. Consultar [SMS y privacidad](../docs/mobile-and-reading.md).

No ejecutar simultáneamente despachadores contra D1 y PostgreSQL. Conservar la deduplicación y toma exclusiva de eventos mediante actualización condicional y `RETURNING`. No reintentar automáticamente estados inciertos. Reanudar un único ejecutor después de verificar recuentos, consentimiento, verificación y continuidad de los eventos.

## Antes de activar el destino

1. Elegir el proyecto de ensayo y configurar los secretos del servidor; nunca subir claves o volcados a Git.
2. Implementar PostgreSQL para **todos** los consumidores de `getDb()`: autenticación, administración, expedientes, cargas, asignaciones, comisiones y SMS. El REST histórico de `db/supabase.ts` solo cubre cargas. Adaptar operaciones D1 `batch`, transacciones, `RETURNING`, conflictos e indicadores 0/1.
3. Ejecutar las pruebas de integración contra PostgreSQL y una importación de ensayo. Las pruebas locales de preparación no sustituyen ejecutar el SQL en PostgreSQL/Supabase.
4. Comparar las 13 tablas (sesiones de destino: cero), identificadores y relaciones. Conciliar cargas cerradas/vencidas, totales de comisiones por estado, pagos, preferencias y estados SMS. Verificar cada `object_key` no nulo contra R2.
5. Probar registro, inicio de sesión, administrador, privacidad entre cuentas, documentos, avisos, asignación/cierre del flete, comisión y pago. Probar retirada de consentimiento, cambio de teléfono, verificación y deduplicación con un proveedor simulado antes de una entrega real autorizada. Confirmar que los roles públicos no acceden a las tablas.
6. Respaldar con escrituras y SMS detenidos, importar y repetir la conciliación. Solo entonces cambiar la configuración y desplegar la aplicación adaptada.

## Reversión

Conservar D1 y el respaldo R2. Si falla la comprobación antes de reabrir escrituras, volver a la versión D1 y reanudar un único ejecutor. Si PostgreSQL ya recibió escrituras, detener ambas bases y SMS y conciliar las nuevas operaciones y estados de envío antes de volver. Cambiar solo la variable perdería datos o duplicaría mensajes. No eliminar el origen hasta aprobar la continuidad.

Referencias: [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [contraseñas de Supabase Auth](https://supabase.com/docs/guides/auth/passwords).

Las cuentas bancarias se migran cifradas. Conservar BANK_ACCOUNT_ENCRYPTION_KEY como secreto y aplicar la nueva tabla bank_accounts; ver ../docs/bank-accounts.md.
