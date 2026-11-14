# Administración de usuarios

La cuenta administradora se vincula por su identificador inmutable en D1 mediante la variable de servidor `ADMIN_ACCOUNT_ID`. El permiso no se deduce del correo, el tipo de cuenta ni de valores enviados desde el navegador. Un registro nuevo con el mismo correo no hereda el acceso.

El panel `/admin.html` consulta `/api/admin/users`. Solo una sesión de la cuenta configurada puede ver nombres, correos, tipos y fechas de registro, con filtros y paginación de 25 cuentas. No devuelve contraseñas, hashes, tokens de sesión ni direcciones IP.

## Configuración por el propietario del alojamiento

Si se necesita localizar la cuenta, configurar temporalmente `ADMIN_SETUP_EMAIL` y un `ADMIN_SETUP_TOKEN` aleatorio como secretos de servidor. El endpoint de configuración `GET /api/admin/setup-lookup`, con el token en la cabecera Authorization, solo devuelve el identificador de ese correo configurado. No acepta un correo de consulta ni concede permisos.

Configurar `ADMIN_ACCOUNT_ID` con el identificador confirmado, retirar ambos secretos temporales y volver a desplegar la misma versión. Sin los secretos el endpoint de configuración responde 404. No guardar credenciales en el código ni registrar cabeceras de autenticación.

El panel es de consulta: no permite cambiar permisos, contraseñas ni borrar cuentas.
