# Cuentas propias de RutaCarga

El acceso de la aplicación usa correo y contraseña guardados en D1. Las cabeceras de identidad del alojamiento no autentican publicaciones. No se enlazan automáticamente cuentas nuevas con propietarios antiguos por coincidencia de correo.

- Contraseñas de 12 a 128 caracteres; hash scrypt con sal aleatoria (N=32768, r=8, p=3).
- Tokens de sesión aleatorios de 256 bits. Solo su hash SHA-256 se guarda en D1.
- Cookies de producción `__Host-rutacarga_session`, HttpOnly, Secure, SameSite=Lax y Path=/; duración de siete días.
- Registro e inicio de sesión limitados por correo y dirección IP, con contadores atómicos en D1.
- Cierre de sesión con revocación del token en el servidor y protección de origen para operaciones POST.
- Las tablas se crean mediante la migración `0001_parched_hellcat.sql`; no se modifica la tabla de cargas existente.

## Alcance

El registro inicia sesión inmediatamente. El correo no se verifica y no constituye una verificación de empresa. La recuperación de contraseñas por correo queda pendiente de configurar un proveedor de correo transaccional. No se incluyen enlaces de recuperación que no funcionen.

## Pruebas

Desde `platform/`, ejecuta `npm run build` y después `npm run test:accounts`. No requiere un servidor de desarrollo activo.

Las pruebas de integración ejecutan la compilación en un Worker aislado con D1 temporal en memoria. No usan conexiones de producción ni la base local del usuario. El entorno temporal se elimina al terminar. Comprueban registro, normalización de correo, contraseñas incorrectas, cookies, rotación y caducidad de sesiones, publicación, lectura pública, CSRF, límites de intentos y cierre de sesión.
