# RutaCarga

MVP web para que empresas publiquen cargas y transportistas las encuentren por origen, destino y equipo.

## Probar la app

Abre `index.html` en un navegador moderno. No requiere instalar dependencias ni levantar un servidor.

- Busca y ordena cargas disponibles.
- Publica una carga con fecha, equipo, peso, pago y correo de contacto.
- Las cargas que publiques se guardan en el almacenamiento local de ese navegador.
- El botón de contacto abre el programa de correo predeterminado para las cargas publicadas.
- Las cargas que aparecen inicialmente son ejemplos ficticios; no representan ofertas reales y su contacto está deshabilitado.

## Límite del MVP

Esta versión no tiene servidor ni base de datos compartida: las publicaciones solo existen en el navegador donde se crearon. Para que distintas empresas y transportistas vean las mismas cargas, el siguiente paso es conectar una API y una base de datos, además de incorporar cuentas y verificación de empresas.
