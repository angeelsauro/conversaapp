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
- Desde 0.3.0 hay envío manual de texto desde el panel. No hay envío, descarga ni visualización de medios: se muestran como tarjetas («Foto», «Mensaje de voz»…) para abrirlos en WhatsApp.
- El modo de IA tiene un punto de extensión heredado; no hay adaptador activo, ni se necesita OpenAI para el modo determinista solicitado.
- No hay clientes múltiples, roles, registro, recuperación de cuentas, cuotas por cliente, facturación, aplicaciones nativas ni publicación en tiendas.
- Desde 0.3.0 el historial se pide por conversación (/api/chat/messages), pero el servidor descifra todos los mensajes en cada consulta. Evaluar índices, escalabilidad y UX con volúmenes grandes.
- Una revisión externa de seguridad y privacidad sigue pendiente; las pruebas existentes no son una certificación.

## Revisar antes de desplegar

1. Definir alojamiento persistente y operación: backup, monitoreo, retención, recuperación, rotación y pruebas de restauración. No arrancar dos procesos con una misma sesión.
2. El compose incluido publica 80/443 mediante Caddy. Una pantalla autenticada NO convierte al servidor en una red privada. El requisito del propietario es administración restringida: diseñar VPN/control de acceso o aislamiento antes de publicar. Usar DNS no aporta privacidad por sí solo. Desde 0.2.1, Caddy admite una lista de IP/CIDR permitidas (`CONVERSA_ALLOWED_IPS`, ver DEPLOY.md); comprobar desde una red no permitida que responde 403, porque si Docker oculta la IP real del cliente la lista no protege nada. Opción recomendada: `deploy/compose.tunnel.yaml` con Cloudflare Access solo para el correo del propietario (SEGURIDAD-PUBLICACION.md). Un subdominio «oculto» no protege nada: los certificados HTTPS quedan en registros públicos (Certificate Transparency).
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
- Cabeceras HTTP adicionales: Cross-Origin-Opener-Policy, Cross-Origin-Resource-Policy, Permissions-Policy y X-Robots-Tag (noindex).
- En HTTPS, la cookie de sesión se llama `__Host-conversa_session`: un subdominio hermano del mismo dominio de empresa no puede plantarla ni sobrescribirla (cookie tossing).
- `deploy/compose.tunnel.yaml`: variante sin puertos abiertos con Cloudflare Tunnel, pensada para tener Cloudflare Access delante. Revisión de seguridad para publicar en el dominio de Andina Music en SEGURIDAD-PUBLICACION.md.
- Panel: eliminar respuestas guardadas; confirmación antes de activar el bot; fecha relativa en la lista de chats («Ayer», día de la semana o fecha, no solo la hora); mensajes de error legibles cuando un proxy devuelve una página no JSON; se quitó un nombre propio fijo del texto de protecciones; la pantalla de acceso explica el uso en servidor.
- Prueba real en local: botón «Prueba real (PRUEBA)» en las opciones del chat, que usa /api/bot/test. Solo aparece cuando el servidor tiene activas las rutas de prueba (`tests` en /api/state), así que no aparece en producción. Guía para el propietario en PRUEBA-REAL.md.
- `Abrir-Conversa.cmd`: doble clic en Windows sin depender de la política de ejecución. Comprueba Node.js 24 (si falta, ofrece instalarlo con winget), ejecuta `npm ci` si no hay node_modules, arranca y abre el panel. No muestra el código de acceso ni cuando falla la apertura del navegador. Se niega a arrancar dentro de OneDrive, que subiría `.data` (sesión, base y clave) a la nube y puede dañar SQLite al sincronizarla.
- `Abrir-Conversa.ps1` espera a que el servidor responda, muestra el error si no arranca y avisa si el puerto 4318 lo ocupa otro Conversa (otra carpeta o versión). Se guarda en UTF-8 con BOM para que Windows PowerShell 5.1 muestre bien las tildes.
- Despliegue: lista opcional de IP permitidas en Caddy (`CONVERSA_ALLOWED_IPS`, que también acepta `prepare-deploy.mjs` como segundo argumento); `.dockerignore` excluye `.git`, copias y documentación.
- `npm run preview`: vista previa con datos ficticios, sin WhatsApp. `npm run demo`: la misma vista previa en un solo archivo HTML, sin servidor.
- Confirmaciones dentro del panel (activar bot, borrar mensajes, eliminar o descartar respuestas) en lugar de `confirm()` del navegador, que algunos visores integrados bloquean.
- `scripts/install-server.sh` + SERVIDOR.md: instalación en Ubuntu 24.04 (DigitalOcean) con una línea. Instala Docker, ufw (solo SSH entrante), fail2ban y actualizaciones automáticas; descarga el código con un token de GitHub de solo lectura que no guarda; genera los secretos sin mostrarlos y arranca la variante con túnel. Sintaxis validada; falta la primera ejecución en un Droplet real.
- CI de GitHub Actions: `npm ci` + `npm test` en Node 24, construcción de la imagen Docker y validación del Caddyfile.

### Verificación de esta revisión

- `npm test`: 24 pruebas aprobadas, 0 fallidas (20 originales + 4 nuevas en test/hardening.test.mjs), Node 24.21.0, Linux. La prueba nueva de exclusión falla con el código 0.2.0, lo que confirma que detecta el error corregido.
- Navegador real (Chromium/Playwright) contra `npm run preview` y contra `dist/conversa-demo.html`: acceso con enlace privado (el código desaparece de la URL), 7 chats ficticios, prueba privada con coincidencia única y con dos coincidencias (no responde), crear y eliminar una respuesta, activar el bot con confirmación, respuesta simulada a un mensaje entrante con traspaso a revisión, cierre de sesión. Sin desplazamiento horizontal a 375, 390, 430 y 1440 píxeles. Sin errores de JavaScript; el único error de consola es el 401 esperado tras cerrar la sesión.
- Imagen Docker de producción con `docker compose`, Caddy y HTTPS (certificado interno para un dominio de prueba): contenedor sano según el healthcheck, usuario `node` (uid 1000), sistema de archivos de solo lectura, cookie `Secure`, HSTS y CSP presentes, origen hostil rechazado (403), endpoints de prueba en 404, lista de IP de Caddy bloqueando (403) y permitiendo (200). Tras `restart` y tras `kill -9`, el bloqueo de instancia se recupera y la pausa explícita se conserva. El código de acceso no aparece en los registros.
- En la prueba con Docker sin iptables, Caddy veía la IP de la puerta de enlace de Docker y no la del cliente. Por eso hay que comprobar la lista de IP en el servidor real (ver DEPLOY.md).
- Prueba real con WhatsApp, autorizada por el propietario y hecha desde un entorno de nube, sin descarga de historial:
  - Se vinculó el número del propietario con el QR.
  - Se activó la prueba PRUEBA para el chat de un contacto. Al recibir `PRUEBA`, Conversa respondió una sola vez el texto neutro en menos de 2 segundos, el chat pasó a revisión y la prueba quedó consumida.
  - Después se pausó la recepción, se desvinculó la sesión y se borraron los datos (detalle en SEGURIDAD-PUBLICACION.md).
  - Repetirla en el servidor definitivo antes de operar.

## Versión 0.3.0 (9 de octubre de 2026): pulido del chat

Fase 1 de la auditoría de interfaz: el panel funciona como un chat de mensajería y no solo como un visor.

### Cambios

- Responder desde el panel: campo de texto con envío (Enter envía y Mayús+Enter añade una línea; en el móvil, el botón), respuestas guardadas insertables con el botón de rayo, y estado de cada mensaje propio (enviando, enviado o sin confirmar). Si respondes tú, el bot se pausa en ese chat. Sustituye al pie «Continúa desde WhatsApp».
- No leídos: contador por chat, insignia en «Mensajes» (roja en el móvil), número en la pestaña del navegador y separador «N mensajes no leídos» al abrir el chat. Abrir un chat lo marca como leído solo en Conversa; WhatsApp no recibe confirmación de lectura.
- Lista de chats: último mensaje con «Tú:» o «Bot:», icono del tipo de contenido y orden por la última actividad. Los chats anteriores a 0.3.0 reciben su último mensaje una vez, al arrancar.
- Conversación: cada chat se carga aparte, con 150 mensajes y el botón «Cargar mensajes anteriores». Burbujas agrupadas con cola, respuestas del bot en violeta con la etiqueta «Respuesta automática», separadores «Hoy» y «Ayer» fijos al desplazarse, y tarjetas para foto, voz, video, documento y visualización única.
- Diseño: iconos SVG propios en lugar de caracteres (se ven igual en Android, iOS y Windows), avatares redondos con degradado, fondo con textura, menú «Mensajes, Mi bot, Conexión» y barra inferior con insignia en el móvil. Texto mínimo de 11 a 12 px (antes 10 px) y gris secundario más oscuro, para un contraste mayor. Animación solo en el mensaje que acaba de llegar, desactivada con «reducir movimiento».
- Corrección: el mismo mensaje recibido con las dos direcciones del contacto (PN y LID) se guardaba dos veces. Ahora se guarda una sola copia.
- API: GET /api/chat/messages, POST /api/chat/send y POST /api/chat/read (ver API-REVISION.md).
- Vinculación persistente: antes, Conversa podía perder la vinculación de WhatsApp sin que el propietario la quitara, por tres causas.
  - El conector borraba la sesión ante el código 500 («bad session»). Baileys asigna ese código a cualquier `stream:error` sin código conocido y a `failure` sin motivo, que suelen ser fallos pasajeros. Ahora la sesión solo se borra con 401 (loggedOut) o con el conflicto `device_removed`, es decir, cuando el propietario quita Conversa en Dispositivos vinculados. Lo demás reconecta con espera exponencial (máximo 60 s) y conserva las claves; tras 5 intentos fallidos, el panel lo explica.
  - El código 440 (otra conexión con la misma vinculación) dejaba la pausa guardada, así que tras un reinicio no se reconectaba. Ahora pausa solo el proceso actual y un reinicio reanuda.
  - Un error local (almacenamiento o arranque del socket) dejaba WhatsApp apagado hasta reiniciar. Ahora reintenta al minuto, salvo pausa o desvinculación explícitas.
- Reinicio tras corte de luz: en el contenedor (con `init: true`) node recibe siempre el mismo PID. Si el bloqueo `server.lock` del proceso muerto coincidía en PID y en instante de arranque, Conversa se negaba a arrancar. Ahora un bloqueo con el PID propio que este proceso no tomó se considera abandonado.
- SQLite usa `synchronous=FULL` de forma explícita: cada escritura confirmada, incluidas las claves de sesión de WhatsApp, sobrevive a un corte de luz.

### Verificación de esta versión

- `npm test`: 34 pruebas aprobadas, 0 fallidas.
  - 4 nuevas en test/chat-panel.test.mjs: último mensaje, no leídos, deduplicación PN/LID, relleno inicial, envío manual (confirmado, sin confirmar y sin conexión) y rutas HTTP.
  - 6 nuevas en test/session-persistence.test.mjs: errores 500/503/408/428 conservan la vinculación, reinicio sin QR nuevo, 440 sin pausa permanente, desvinculación solo con 401 o `device_removed`, reintento tras fallo local, y bloqueo con el mismo PID tras reiniciar. Con el código anterior fallan 5 de estas 6; la del reinicio sin QR ya pasaba.
- Navegador real (Chromium/Playwright) contra `npm run preview` y contra `dist/conversa-demo.html`, 37 y 38 comprobaciones aprobadas. Incluyen:
  - insignia y título con no leídos, «Bot:» y «Tú:» en la lista, separador de no leídos y marcado como leído;
  - tarjetas de foto y voz, envío con Enter y marca de enviado, Mayús+Enter, y menú de respuestas guardadas que inserta el texto sin enviarlo;
  - campo de escritura visible y con letra de 16 px en móviles de 375, 390 y 430 píxeles, sin desplazamiento horizontal y sin errores de JavaScript.
- Pendiente en el servidor real:
  - enviar un mensaje desde el panel y comprobar que llega una sola vez y que el panel muestra su marca;
  - reiniciar el VPS (`reboot`) y comprobar que WhatsApp vuelve a «Conectado» sin QR nuevo.

## Versión 0.4.0 (9 de octubre de 2026): el efecto «wow»

Objetivo: que el panel se sienta como una app de mensajería moderna (tiempo real, archivos dentro del chat, fotos de perfil, modo oscuro, app instalable con notificaciones), sin perder las protecciones de privacidad.

### Cambios

- **Tiempo real:** un flujo SSE (/api/events) avisa al panel de cada cambio. Los mensajes aparecen al instante y la consulta periódica queda como respaldo cada 30 s. La demo de un solo archivo sigue consultando cada 3 s.
- **Archivos dentro del chat:**
  - **Fotos y stickers:** se ve la miniatura de WhatsApp al instante, desenfocada, y el archivo real aparece encima con un fundido. Al tocarlas se abren a pantalla completa con botón de descarga.
  - **Notas de voz:** reproductor con forma de onda que se puede tocar o mover con las flechas, y velocidad 1×, 1,5× o 2×.
  - **Videos y documentos:** los videos se ven en el visor; los documentos se descargan, con nombre y tamaño.
  - Se descargan bajo demanda y solo en memoria. La visualización única sigue sin abrirse nunca.
- **Fotos de perfil** de WhatsApp sobre las iniciales.
- **Responder citando:** en PC al pasar el ratón; en móvil con un toque. La cita se ve en la burbuja y, al tocarla, el chat salta al mensaje original.
- **Reacciones** (👍 ❤️ 😂 😮 😢 🙏), enviadas a WhatsApp. Las del contacto se ven en tu burbuja y en la lista («Reaccionó ❤️ a…»).
- **Selector de emojis** en el campo de escritura.
- **Modo oscuro:** automático según el dispositivo, o fijo con el botón junto al estado de conexión. Se aplica antes de pintar la página, sin destello blanco.
- **App instalable (PWA):** icono propio, pantalla completa y notificaciones push cifradas (VAPID + aes128gcm, sin dependencias). Al tocar la notificación se abre el chat. Opción para ocultar nombre y texto.
- **Fluidez:** al redibujar el chat se reutilizan las burbujas que no cambian, así que una nota de voz no se corta al llegar un mensaje y las fotos no parpadean. El chat abierto también se recarga cuando cambian reacciones o estados de envío (`rev`).

### Verificación de esta versión

- `npm test`: 53 pruebas aprobadas, 0 fallidas.
  - 5 en test/media-security.test.mjs (ver «Revisión de 0.4.0»).
  - 5 en test/push.test.mjs: incluye el vector de RFC 8291, que coincide byte a byte.
  - 9 en test/wow.test.mjs: pie, miniatura y origen del archivo; nada de visualización única; citas y reacciones; SSE más allá del tiempo de petición; rangos de bytes, caché y descargas como adjunto; fotos de perfil solo de WhatsApp; push con presencia, modo privado y suscripciones caducadas; reacción y respuesta citada; archivos PWA.
- Navegador real (Chromium/Playwright): 51 comprobaciones contra `npm run preview` y 52 contra `dist/conversa-demo.html`. Incluyen foto que carga sobre su miniatura, nota de voz que suena, visor, reacción enviada y mostrada, respuesta con cita, emoji, SSE conectado, tema oscuro manual y automático, herramientas por toque en móvil, sin desplazamiento horizontal y sin errores de JavaScript.
- Revisión independiente de seguridad y código del diff: ver «Revisión de 0.4.0» más abajo.
- Pendiente en el servidor real:
  - notificación en Android y en iPhone (icono instalado);
  - abrir una foto y un audio reales;
  - comprobar que una nota de voz de WhatsApp (Ogg/Opus) suena en iPhone; si Safari no la reproduce, el panel ofrece descargarla.

### Revisión de 0.4.0 (auditoría independiente)

Un revisor independiente auditó el cambio completo. Encontró 1 problema alto, 2 medios y 8 bajos. Todos están corregidos:

- **Alto, SSRF por archivos:** un mensaje con un archivo manipulado (`url` o `directPath` a otra dirección) hacía que Baileys lo descargara al abrir el chat. Seguía redirecciones, no tenía tiempo máximo y guardaba todo en memoria. Eso permitía revelar la IP real del servidor, hacer peticiones internas o agotar la memoria. Corrección:
  - la descarga la hace Conversa: solo `https://mmg.whatsapp.net` más un `directPath` validado, también tras la resubida;
  - sin redirecciones, con 30 s y un tope de tamaño mientras se lee;
  - verificación del HMAC antes de descifrar;
  - como máximo 3 descargas a la vez.
- **Medio:** las suscripciones push sobrevivían al cierre de sesión. Ahora quedan ligadas a la sesión; cerrar sesión o revocarlas las borra, junto con `Clear-Site-Data`.
- **Medio, privacidad:** el `Topic` push era un SHA-256 del JID, reversible a número de teléfono. Ahora es un HMAC con clave del servidor.
- **Bajos:**
  - archivos en la caché del navegador: ahora `no-store`;
  - contador de la caché de archivos al borrar un chat;
  - nombres de archivo con emojis cortados que hacían fallar la descarga (`toWellFormed`);
  - reacciones de otro chat que reutilizaban un id;
  - visualización única a una profundidad de anidamiento mayor de la que WhatsApp envía;
  - foto de perfil guardada en un chat recién borrado;
  - en el panel: la velocidad del audio se perdía al redibujar, una reacción fallida deshacía otra posterior y un envío fallido perdía la cita;
  - el aviso de presencia se envía con `keepalive`.
- Las 5 pruebas de test/media-security.test.mjs fallan con el código anterior y pasan con el corregido. Tras las correcciones, el navegador pasa de nuevo 51 y 52 comprobaciones.

## Versión 0.4.1 (9 de octubre de 2026): perfil del contacto y revisión de uso con datos reales

Primera prueba con la cuenta real del propietario (609 chats): aparecían burbujas «Archivo», no se podía abrir el perfil del contacto y «Pedir más historial» daba un error genérico.

### Cambios

- **Perfil del contacto:** se abre al tocar la foto o el nombre, o con ⋮. Muestra:
  - la foto grande (se pide a WhatsApp al abrirla) y el número, con «WhatsApp» (wa.me), «Copiar número» y «Buscar»;
  - la info del contacto, si su privacidad lo permite;
  - fotos, videos y documentos compartidos;
  - las opciones del bot para ese chat.
- **Búsqueda dentro del chat:** recorre los mensajes cargados; Enter va a la coincidencia anterior.
- **Botón para ir al último mensaje,** con el número de mensajes que llegaron mientras leías arriba.
- **Tipos de mensaje nuevos:**
  - tarjetas para ubicación (con «Abrir en el mapa»), contacto, encuesta, evento, invitación a grupo y llamada;
  - videos circulares y stickers animados;
  - «Se eliminó este mensaje» y «editado»; solo el autor, dentro del mismo chat, puede borrar o editar;
  - los mensajes que solo traen datos internos de WhatsApp ya no aparecen como «Archivo»; los tipos desconocidos dicen «Mensaje no compatible».
- **Enlaces que se pueden pulsar:** solo http(s), en otra pestaña y con `noopener noreferrer`.
- **Copiar un mensaje,** filtro «No leídos» y Esc para cerrar el perfil y la búsqueda.
- **Lista de chats más limpia:** los contactos sin conversación que llegan con la agenda de WhatsApp ya no llenan la lista; aparecen al buscarlos. Los contactos sin nombre muestran su número.
- **«Pedir mensajes anteriores»:**
  - busca la referencia en todas las direcciones del contacto (antes fallaba si los mensajes estaban guardados con la otra dirección);
  - se desactiva cuando el chat no tiene mensajes, porque WhatsApp no puede entregar historial sin uno de referencia;
  - explica el motivo en lugar de «No se pudo completar la acción».

### Verificación

- `npm test`: 56 pruebas aprobadas, 0 fallidas (3 nuevas en test/profile.test.mjs).
- Navegador real: 62 comprobaciones contra `npm run preview` y 63 contra la demo. Incluyen el perfil con número y archivos, abrir una foto desde el perfil, Esc, la tarjeta de ubicación con su enlace al mapa, el mensaje eliminado, un enlace seguro, la búsqueda en el chat y el perfil a pantalla completa en el móvil.

## Versión 0.5.0 (9 de octubre de 2026): app pública multiusuario

Decisión del propietario: publicar en Google Play para clientes nuevos (cuenta de organización de Andina Music, con D-U-N-S), con la conexión no oficial actual y el riesgo advertido a cada cliente.

### Cambios

- **Multiusuario:** un espacio aislado por cliente (`u_…`) en la misma base cifrada, cada uno con su conexión, bot, notificaciones, archivos y fotos de perfil. El panel del propietario (`owner`) no cambia.
  - Las cachés, la presencia, el SSE y las notificaciones se separan por espacio.
  - Las fotos de perfil se piden por turnos entre espacios, de una en una.
- **Dos orígenes:** `PUBLIC_ORIGIN` (panel privado, tras Access) y `APP_ORIGIN` (app pública). En producción, cada origen acepta solo su tipo de sesión.
- **Registro:**
  - Número y contraseña (scrypt), con aceptación obligatoria del aviso de riesgo y de las condiciones.
  - Vinculación con **código** en WhatsApp («Vincular con el número de teléfono»), que funciona en el mismo móvil.
  - El conector comprueba que el número vinculado sea el de la cuenta; si no, desvincula al instante.
- **Cuenta:**
  - Sesión de 30 días; cambiar la contraseña cierra las demás sesiones.
  - Recuperación con un código de 6 cifras enviado al propio WhatsApp del cliente.
  - **Eliminar cuenta** dentro de la app, como exige Google Play: desvincula el dispositivo, borra todo el espacio y limpia el navegador.
- **Interfaz:** bienvenida, pestañas de crear cuenta y entrar, recuperación, pantalla de vinculación con código grande y pasos, y la tarjeta «Tu cuenta» en Ajustes. «Conexión» pasa a llamarse «Ajustes».
- **Para Google Play:**
  - `/.well-known/assetlinks.json` configurable;
  - páginas legales públicas en `/legal/`;
  - cuenta de demostración para los revisores (`CONVERSA_DEMO_ACCOUNT`), con datos ficticios y sin acceso a WhatsApp.
- **Despliegue:**
  - variables nuevas en `deploy/compose.yaml`;
  - `CONVERSA_TRUST_CF=1` en la variante con túnel, para que los límites usen la IP real de Cloudflare;
  - `install-server.sh --set CLAVE=valor` con una lista de ajustes permitidos y valores validados.

### Verificación

- `npm test`: 65 pruebas aprobadas, 0 fallidas (9 nuevas en test/accounts.test.mjs).
  - Registro con aviso y código; vinculación confirmada por número; aislamiento entre clientes y con el propietario.
  - Separación de panel y app; inicio de sesión con límites y respuesta uniforme.
  - Borrado completo con desvinculación; recuperación por WhatsApp; límite de cuentas.
  - assetlinks; páginas legales sin acceso al código fuente; cuenta demo; conector con código, número ajeno y código caducado.
- Navegador real:
  - 18 comprobaciones del recorrido del cliente: bienvenida, aviso obligatorio, código, apertura al vincular, ajustes, salir y entrar, contraseña errónea, recuperación, eliminar cuenta y la política de privacidad pública;
  - 62 comprobaciones del panel del propietario y 63 de la demo, sin regresiones.
- Pendiente: probarlo con un número real en el servidor (código de WhatsApp real), revisión de seguridad independiente del cambio y publicación en Google Play (ver PUBLICAR-GOOGLE-PLAY.md).

## Versión 0.5.1 (9 de octubre de 2026): interfaz limpia, marca propia y correcciones de seguridad

Pedido del propietario: quitar textos innecesarios para que se vea moderna y limpia, y poder cambiar el nombre y el logo de la app solo como super admin, con logos genéricos listos (juegos, calculadora, calendario…). Para los clientes será una opción de pago más adelante.

### Cambios

- **Interfaz:**
  - Avisos flotantes de 3 a 5 segundos en lugar de líneas de estado fijas.
  - Fuera textos de relleno: notas al pie, explicaciones repetidas, el contador de conversaciones y el estado del historial.
  - Ajustes en dos columnas en pantallas grandes; con WhatsApp conectado desaparecen los pasos para vincular.
  - Cabecera móvil compacta con el nombre de la app; la lista de chats llena la pantalla hasta la barra inferior.
- **Marca propia (solo super admin):**
  - En Ajustes → Marca: nombre, logo subido (recortado a cuadrado en el navegador) o uno de 10 logos genéricos sin texto (bloques, gema, dados, planeta, burbujas, calculadora, calendario, notas, clima, reloj).
  - Cambia el menú, la pestaña, el favicon, el icono y el nombre de la app instalada, y el título e icono de las notificaciones.
  - Las cuentas de clientes no ven la opción ni cargan los logos, y el servidor la rechaza para ellas.
- **Seguridad:** todas las correcciones de la revisión independiente de 0.5.0 (ver SEGURIDAD-PUBLICACION.md).
- **Google Play:** páginas legales, ficha, capturas con la interfaz nueva, `android/twa-manifest.json` y PUBLICAR-GOOGLE-PLAY.md, con marcadores a completar.

### Verificación

- `npm test`: 78 pruebas aprobadas, 0 fallidas.
  - 3 nuevas de marca: solo el propietario, PNG validados, manifiesto e iconos, logos listos, notificaciones.
  - 10 nuevas de seguridad de cuentas.
- Navegador real: 62 comprobaciones del panel, 18 del recorrido del cliente, 63 de la demo y 14 de la marca (elegir un logo listo, guardar, ver el cambio en menú, pestaña, manifiesto e iOS, restaurar, y comprobar que la app de clientes no carga los logos). Todas aprobadas.
- El icono de la app de Google Play viene del paquete Android; la marca cambia la app web instalada desde el navegador.
