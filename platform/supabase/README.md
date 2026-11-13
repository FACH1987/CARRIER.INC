# Migración futura a Supabase (aplazada)

Decisión del usuario: mantener Cloudflare D1 como base de datos activa. La migración a Supabase queda aplazada; estos archivos se conservan como preparación para cuando el usuario decida retomarla.

1. Conectar la integración Supabase y seleccionar el proyecto de destino.
2. Aplicar `migrations/202611130001_loads.sql`. No ejecutar sobre una tabla existente sin revisar su esquema.
3. Migrar los registros existentes de D1 conservando los identificadores y propietarios. Verificar también las cargas vencidas: la API pública solo devuelve las vigentes.
4. Configurar en Sites las variables de servidor `SUPABASE_URL` y `SUPABASE_SECRET_KEY`; esta última debe guardarse como secreto, nunca en el navegador ni en Git.
5. Probar lectura, publicación, rechazo de solicitudes anónimas y continuidad de datos.
6. Activar `DATABASE_PROVIDER=supabase` y desplegar. Conservar D1 durante la verificación para poder revertir.

La migración de las cuentas propias de D1 deberá planificarse por separado; no se migran contraseñas automáticamente. La base de datos PostgreSQL de Supabase usa RLS, sin acceso directo para los roles anon y authenticated; la API del servidor valida y autoriza las operaciones.

Documentación: https://supabase.com/docs/guides/getting-started/api-keys
