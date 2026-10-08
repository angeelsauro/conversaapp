# Entrega técnica de Conversa

Fecha: 8 de octubre de 2026. Conversa QR 0.2.1: revisión técnica del snapshot 0.2.0 entregado ese mismo día. Los cambios de la revisión están en la sección «Revisión 0.2.1» al final.

## Alcance de la entrega

Código fuente completo de la aplicación local actual, frontend, servidor, pruebas, lockfile de dependencias, scripts y configuración Docker/Caddy. No es una versión certificada para producción ni una aplicación móvil publicada. Este documento describe el estado actual y prevalece sobre las notas históricas de README/DEPLOY.

No se incluyen datos de ejecución, sesiones vinculadas, contactos, mensajes, códigos de acceso, claves de cifrado, archivos .env, node_modules ni recursos de cuentas externas. La instalación de los ingenieros será independiente; no conectará automáticamente la cuenta del propietario. No deben solicitar ni compartir el directorio .data por correo o repositorios.

## Arranque local independiente

Requisitos: Node.js 24 o posterior y npm. Extraer el ZIP y entrar en la carpeta Conversa.

```sh
npm ci
npm test
npm start
```

El servidor escucha en http://127.0.0.1:4318. En Windows, después de instalar las dependencias, ejecutar Abrir-Conversa.ps1 para abrir la sesión privada; no compartir la URL con fragmento de acceso. En otros sistemas, el formulario admite el código generado localmente en .data/owner-token. No imprimirlo en registros compartidos. Usar un número de pruebas y evitar una segunda instancia en la misma carpeta de datos o con la misma sesión de WhatsApp.

Vista previa sin WhatsApp: `npm run preview` levanta el panel en http://127.0.0.1:4319 con chats ficticios en una carpeta temporal que se borra al cerrar. No usa `.data`, no conecta con WhatsApp y su «QR» no vincula ningún teléfono. Sirve para revisar diseño y flujo (revisión de chats, biblioteca, prueba privada, activación del bot con una respuesta simulada).

Demo de un solo archivo: `npm run demo` genera `dist/conversa-demo.html`, que se abre con doble clic en cualquier navegador, sin Node ni servidor. Ejecuta el código real de src/history.mjs y src/bot.mjs sobre datos ficticios en memoria. Las rutas /api/* se atienden en el propio navegador imitando src/server.mjs. No sustituye las pruebas del servidor.

npm start crea la base y las credenciales de acceso locales. El bot empieza desactivado. Los textos y palabras clave guardados en la instancia del propietario no están incluidos: son datos privados de ejecución. El puerto debe estar libre.

## Arquitectura

- public/index.html, styles.css, app.js: interfaz sin framework, lista/detalle de chats, diseño móvil, sonidos optativos, biblioteca y prueba privada de respuestas.
- src/server.mjs: HTTP, autenticación por cookie, rutas privadas, límites, Origin/Host, CSP y arranque.
- src/connector.mjs: sesión Baileys, QR, eventos, reconexión y persistencia de credenciales.
- src/history.mjs: mensajes, clasificación de chats, fecha de corte, alias PN/LID y exclusiones.
- src/bot.mjs: textos guardados, coincidencia de palabras clave, cola persistente y traspaso a revisión.
- src/store.mjs: SQLite, valores cifrados AES-GCM e índices HMAC.
- src/lock.mjs: exclusión de procesos concurrentes.
- scripts/: respaldo/restauración cifrados, preparación de despliegue, healthcheck y vista previa con datos ficticios.
- test/: pruebas aisladas con datos ficticios; no necesitan WhatsApp real.

Baileys usa una conexión de dispositivo vinculado no oficial. No se garantiza historial completo, conexión permanente ni aceptación de la cuenta por WhatsApp. Mantener los requisitos/licencias de dependencias, revisar riesgos de actualización y restricciones del proveedor antes de operar.

## Implementado y probado

- Vinculación QR y recuperación de sesión persistida; pausa explícita conservada.
- Almacenamiento del historial recibido; representación de medios por tipo, sin descarga de imágenes.
- Exclusión de chats anteriores a la fecha de corte; ausencia de historial no demuestra que un contacto sea nuevo. Se exige revisión para habilitar chats nuevos.
- Biblioteca de hasta 20 respuestas, con textos exactos y palabras/frases configuradas manualmente; normalización de mayúsculas y tildes, no interpretación semántica. Las respuestas se pueden crear, editar y eliminar (debe quedar al menos una).
- keywordOnly: sin coincidencia única no se envía texto. Revisión es un estado interno, no un aviso al contacto.
- handoffAfterReply: pausa después de una respuesta, evitando posteriores envíos en ese chat.
- Cola, deduplicación, validación antes del envío y tratamiento conservador de estados inciertos. No equivale a garantía distribuida de entrega exactamente una vez.
- STOP y mensajes propios detienen la respuesta automática.
- Visualización única: marcador sin desenvolver/descargar contenido, detención y revisión inmediata; propagación al combinar alias.
- Panel de PC y móvil, búsqueda, filtros, opciones por chat y sonido optativo mientras el navegador lo permite. No hay push con la aplicación cerrada.
- Autenticación, protección de origen/host, cifrado, revocación de sesiones y respaldos/restauración.

## Resultado de verificación

En la entrega 0.2.0: npm test, 20 pruebas aprobadas, 0 fallidas, Node 24 en Windows. En la revisión 0.2.1: 24 pruebas aprobadas, 0 fallidas, Node 24.21 en Linux (detalle al final). Se probaron coincidencias, exclusiones, reconexión, persistencia, cifrado, cola y medios de visualización única. El diseño se revisó en viewports 375, 390, 430, 768, 1440 y 1728 píxeles; no sustituye pruebas físicas en Android/iOS ni auditoría de accesibilidad independiente. Hubo una prueba real autorizada con un texto neutro, confirmada por el propietario. No se activa el bot general como parte de la entrega.

## Limitaciones y pendientes

- No hay motor general de secuencias de varios pasos. No se implementó la validación de datos solicitados ni el envío de una segunda respuesta condicionado a ellos.
- reviewWaitMinutes se puede guardar (se solicitó 30), pero NO existe todavía el temporizador que lo ejecuta. No presentar este ajuste como función operativa.
- No existe una carpeta separada «Listos para revisar»; hay revisión interna por handoffAt/handoffReason.
- No hay envío manual desde el compositor del panel. No hay descarga/visualización de medios.
- El modo de IA tiene un punto de extensión heredado; no hay adaptador activo, ni se necesita OpenAI para el modo determinista solicitado.
- No hay clientes múltiples, roles, registro, recuperación de cuentas, cuotas por cliente, facturación, aplicaciones nativas ni publicación en tiendas.
- Historial paginado globalmente, no consulta optimizada por conversación. Evaluar índices, escalabilidad y UX con volúmenes grandes.
- Una revisión externa de seguridad y privacidad sigue pendiente; las pruebas existentes no son una certificación.

## Revisar antes de desplegar

1. Definir alojamiento persistente y operación: backup, monitoreo, retención, recuperación, rotación y pruebas de restauración. No arrancar dos procesos con una misma sesión.
2. El compose incluido publica 80/443 mediante Caddy. Una pantalla autenticada NO convierte al servidor en una red privada. El requisito del propietario es administración restringida: diseñar VPN/control de acceso o aislamiento antes de publicar. Usar DNS no aporta privacidad por sí solo. Desde 0.2.1, Caddy admite una lista de IP/CIDR permitidas (`CONVERSA_ALLOWED_IPS`, ver DEPLOY.md); comprobar desde una red no permitida que responde 403, porque si Docker oculta la IP real del cliente la lista no protege nada.
3. Diseñar autenticación individual y autorización/aislamiento de datos antes de ofrecer el servicio a terceros. El producto actual usa el workspace owner y no es multiusuario.
4. Revisar los endpoints auxiliares /api/chat/send-standard-once y /api/bot/test. Son accesos administrativos autenticados de prueba y permiten una excepción puntual a chats antiguos; el segundo caduca a los 10 minutos y usa un texto neutro fijo. Deshabilitar o restringir explícitamente para producción; no confundir con activación general. Desde 0.2.1 responden 404 cuando NODE_ENV=production, salvo `CONVERSA_TEST_ENDPOINTS=on`; en local siguen disponibles salvo `CONVERSA_TEST_ENDPOINTS=off`.
5. Verificar límites, idempotencia, errores de red, estados inciertos, registros sin datos privados y comportamiento tras revocación de sesión.
6. Revisar consentimiento de destinatarios, tratamiento de datos y compatibilidad con las condiciones de WhatsApp. No afirmar que el historial parcial permite detectar con certeza absoluta todos los chats nuevos.

No se incluyen credenciales ni acceso a Cloudflare, Meta, DNS, proveedores de IA o tiendas. Gestionarlos por canales privados y con permisos mínimos si fueran necesarios.

## Documentos de esta entrega comercial

Leer también ALCANCE-PRODUCTO.md (producto determinista sin IA generativa, requisitos multiusuario y publicación) y API-REVISION.md (rutas actuales y endpoints auxiliares a restringir). El paquete contiene todos los archivos fuente del proyecto QR actual; las exclusiones de datos privados son deliberadas, no funciones faltantes. Los otros prototipos del workspace y cuentas de proveedores externos no son parte de este servidor independiente.

## Revisión 0.2.1 (8 de octubre de 2026)

### Cambios

- Producción: /api/bot/test y /api/chat/send-standard-once quedan desactivados (404) con NODE_ENV=production, salvo `CONVERSA_TEST_ENDPOINTS=on`.
- Corrección: si el propietario escribía «cancelar», «salir», «stop», etc. a un contacto, el chat quedaba marcado como si el contacto hubiera pedido no recibir respuestas, y no se podía volver a habilitar. Ahora solo los mensajes del contacto activan esa exclusión; un mensaje propio sigue pausando el chat.
- /api/chat/delete y /api/history/more validan que el chat sea un contacto directo. Antes, una petición sin chat válido creaba un registro vacío.
- Cola: los trabajos terminados (enviados, omitidos o fallidos) se eliminan a los 7 días. La cola se descifra completa cada segundo y crecía sin límite. Los pendientes e inciertos se conservan.
- Cabeceras HTTP adicionales: Cross-Origin-Opener-Policy, Cross-Origin-Resource-Policy y Permissions-Policy.
- Panel: eliminar respuestas guardadas; confirmación antes de activar el bot; fecha relativa en la lista de chats («Ayer», día de la semana o fecha, no solo la hora); mensajes de error legibles cuando un proxy devuelve una página no JSON; se quitó un nombre propio fijo del texto de protecciones; la pantalla de acceso explica el uso en servidor.
- Prueba real en local: botón «Prueba real (PRUEBA)» en las opciones del chat, que usa /api/bot/test. Solo aparece cuando el servidor tiene activas las rutas de prueba (`tests` en /api/state), así que no aparece en producción. Guía para el propietario en PRUEBA-REAL.md.
- `Abrir-Conversa.ps1` espera a que el servidor responda, muestra el error si no arranca y avisa si el puerto 4318 lo ocupa otro Conversa (otra carpeta o versión). Se guarda en UTF-8 con BOM para que Windows PowerShell 5.1 muestre bien las tildes.
- Despliegue: lista opcional de IP permitidas en Caddy (`CONVERSA_ALLOWED_IPS`, que también acepta `prepare-deploy.mjs` como segundo argumento); `.dockerignore` excluye `.git`, copias y documentación.
- `npm run preview`: vista previa con datos ficticios, sin WhatsApp. `npm run demo`: la misma vista previa en un solo archivo HTML, sin servidor.
- Confirmaciones dentro del panel (activar bot, borrar mensajes, eliminar o descartar respuestas) en lugar de `confirm()` del navegador, que algunos visores integrados bloquean.
- CI de GitHub Actions: `npm ci` + `npm test` en Node 24, construcción de la imagen Docker y validación del Caddyfile.

### Verificación de esta revisión

- `npm test`: 24 pruebas aprobadas, 0 fallidas (20 originales + 4 nuevas en test/hardening.test.mjs), Node 24.21.0, Linux. La prueba nueva de exclusión falla con el código 0.2.0, lo que confirma que detecta el error corregido.
- Navegador real (Chromium/Playwright) contra `npm run preview` y contra `dist/conversa-demo.html`: acceso con enlace privado (el código desaparece de la URL), 7 chats ficticios, prueba privada con coincidencia única y con dos coincidencias (no responde), crear y eliminar una respuesta, activar el bot con confirmación, respuesta simulada a un mensaje entrante con traspaso a revisión, cierre de sesión. Sin desplazamiento horizontal a 375, 390, 430 y 1440 píxeles. Sin errores de JavaScript; el único error de consola es el 401 esperado tras cerrar la sesión.
- Imagen Docker de producción con `docker compose`, Caddy y HTTPS (certificado interno para un dominio de prueba): contenedor sano según el healthcheck, usuario `node` (uid 1000), sistema de archivos de solo lectura, cookie `Secure`, HSTS y CSP presentes, origen hostil rechazado (403), endpoints de prueba en 404, lista de IP de Caddy bloqueando (403) y permitiendo (200). Tras `restart` y tras `kill -9`, el bloqueo de instancia se recupera y la pausa explícita se conserva. El código de acceso no aparece en los registros.
- En la prueba con Docker sin iptables, Caddy veía la IP de la puerta de enlace de Docker y no la del cliente. Por eso hay que comprobar la lista de IP en el servidor real (ver DEPLOY.md).
- No verificado en esta revisión: conexión real con WhatsApp. La red de este entorno de revisión bloquea web.whatsapp.com. La única prueba real de envío sigue siendo la del propietario, en la entrega 0.2.0. Repetirla en el servidor elegido con un número de pruebas antes de operar.
