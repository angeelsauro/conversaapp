# Mapa de API actual para revisión

Base local: http://127.0.0.1:4318. Consultar src/server.mjs como fuente de verdad. Sin contrato de compatibilidad comercial todavía.

## Acceso

POST /api/login recibe {token} del código privado creado localmente. Cookie HttpOnly y SameSite=Strict; Secure con origen HTTPS. POST exige Origin permitido y Content-Type application/json. GET privados requieren sesión; /healthz y archivos públicos no requieren sesión. No incluir tokens, cookies ni claves en issues o capturas.

## Lectura autenticada

- GET /api/state: conexión, primeros mensajes, chats, configuración, estados de cola, datos del workspace. Desde 0.2.1 incluye `tests` (si las rutas de prueba están activas) y `keywordTest` ({jid, expiresAt, consumedAt} de la prueba PRUEBA, o null).
Desde 0.3.0, /api/state incluye hasta 2000 chats y `totalChats`. Cada chat lleva `last` ({text (máx. 200), kind, fromMe, bot, timestamp}) y `unread`: los mensajes en vivo del contacto sin leer desde el panel.
- GET /api/messages?offset=N: página adicional de mensajes; conversationJid normaliza alias para interfaz.
- GET /api/chat/messages?jid=…&before=…: historial de un solo chat (0.3.0). Devuelve {messages, more}: los 150 mensajes más recientes en orden cronológico; con `before` (milisegundos), los anteriores a esa marca. Une los alias PN/LID del contacto. jid debe ser un contacto directo; si no, 400. Hoy descifra todos los mensajes en cada consulta: revisar con volúmenes grandes.
- GET /api/export: exportación de mensajes y chats. Contiene datos privados, nunca adjuntarla al paquete público.

### Desde 0.4.0

- **Datos nuevos en los mensajes:**
  - `media`: {mimetype, size, seconds, ptt, name, width, height, thumb}. `thumb` es la miniatura JPEG que trae WhatsApp, en base64 y de 16 000 caracteres como máximo; se omite en /api/state y /api/messages. En /api/chat/messages, `media.available` indica si el archivo se puede abrir.
  - `quote`: {id, text, kind, fromMe}.
  - `reactions`: {me?, contact?}.
  - El pie de una foto o un video va en `text`.
- **Datos nuevos en los chats:** `photo` (versión de la foto de perfil), `rev` (cambia con reacciones y estados de envío) y `notifications` ({devices, preview}) en /api/state.
- **GET /api/events:** flujo SSE. Envía `event: change` (agrupado cada 120 ms) cuando cambian mensajes, chats, ajustes o cola, y cuando cambia el estado de la conexión. Envía un ping cada 25 s y se cierra al cerrar o revocar la sesión. Admite 8 flujos a la vez como máximo.
- **GET /api/media?id=:**
  - Descarga el archivo de WhatsApp solo cuando se pide y lo guarda en memoria (LRU de 80 MB; 25 MB como máximo por archivo); nunca en disco.
  - Admite rangos de bytes, necesarios para el audio y el video en Safari.
  - La descarga la hace Conversa, no Baileys:
    - solo desde `https://mmg.whatsapp.net` y con un `directPath` validado (`/v/…`); la `url` del mensaje se descarta;
    - sin redirecciones, con 30 s como máximo y un tope de tamaño mientras se lee;
    - comprueba el HMAC del archivo antes de descifrarlo.
  - Como máximo 3 descargas a la vez y 20 en espera; el resto recibe 503.
  - `Cache-Control: private, no-store`.
  - Fotos, audios y videos de tipos conocidos se abren en el navegador. Cualquier otro tipo sale como `application/octet-stream` con `attachment`.
  - Errores: 404 si no hay archivo o es de visualización única (estos nunca se guardan ni se descargan); 409 si WhatsApp está desconectado y el archivo no está en memoria; 413 si es demasiado grande; 502 si WhatsApp no lo entrega.
- **GET /api/avatar?jid=:** foto de perfil pequeña ('preview'), guardada cifrada. El servidor la pide a WhatsApp en segundo plano, de una en una, empezando por los chats recientes, y la refresca a diario. Solo descarga URLs `https` de `*.whatsapp.net`, de 300 KB como máximo, en JPEG, PNG o WebP. Devuelve 404 si no hay foto.
- **GET /api/push/key:** clave pública VAPID para `pushManager.subscribe`.

### Desde 0.4.1

- **GET /api/contact?jid=:** perfil del contacto. Devuelve {jid, name, number, photo, about, files:{photos, documents, audio}}.
  - `number` es `null` si WhatsApp solo dio un identificador LID.
  - `about` se pide a WhatsApp solo al abrir el perfil y se guarda una hora en memoria.
- **GET /api/chat/media?jid=:** fotos, videos y documentos del chat, del más reciente al más antiguo. Hasta 120, con miniatura y `available`.
- **GET /api/avatar/full?jid=:** foto de perfil grande. Se pide a WhatsApp al abrirla, con las mismas restricciones que /api/avatar y 1,5 MB como máximo; se guarda una hora en memoria con `no-store`.
- **Nuevos `kind` de mensaje:**
  - `location`, `contact`, `poll`, `event`, `invite` y `call`, con `detail` ({name, address, lat, lng, phone, options…});
  - `deleted` (tras «eliminar para todos»: sin texto, archivo ni reacciones);
  - `edited: true` en los mensajes editados;
  - los videos circulares (ptv) llegan como `video` y los stickers animados como `sticker`;
  - los mensajes que solo traen datos internos de WhatsApp no se guardan;
  - un mensaje guardado como `other` se completa si WhatsApp lo vuelve a entregar.
- **POST /api/history/more:** busca el mensaje de referencia entre todas las direcciones del contacto (PN y LID). Si el chat no tiene ninguno, responde 400 con una explicación legible.

## Cuentas de clientes (0.5.0)

Hay dos tipos de acceso:
- **Tu panel privado** (`PUBLIC_ORIGIN`): código del propietario y espacio `owner`.
- **La app pública** (`APP_ORIGIN`): cuentas de clientes, cada una con su espacio aislado `u_…`. Cada cuenta tiene su propio WhatsApp, mensajes, bot, notificaciones y archivos.

En producción, cada dirección solo acepta su tipo de acceso. En local, `127.0.0.1` hace de panel y `localhost` de app. Todas las rutas autenticadas siguientes funcionan igual para ambos, siempre dentro del espacio de quien llama.

- **GET /api/config** (pública): {mode: 'app'|'panel', signup, terms}.
- **POST /api/account/signup {number, password, accept:true}:**
  - Crea la cuenta (contraseña con scrypt) y abre una sesión de 30 días.
  - Pide a WhatsApp un **código de vinculación** para ese número y devuelve {pairingCode} (o aparece en /api/state).
  - Si la vinculación se completa con otro número, se deshace al instante.
  - Límites: 5 registros por hora por IP y `CONVERSA_MAX_ACCOUNTS` en total (503 si se alcanza).
  - Un número ya vinculado da 409. Un registro sin terminar puede rehacerse pasados 30 minutos.
- **POST /api/account/login {number, password}:** misma respuesta para un número inexistente y una contraseña errónea. Límites: 10 por minuto por IP y 10 cada 15 minutos por número.
- **POST /api/account/recover {number}:**
  - Si el WhatsApp de la cuenta está conectado, envía un código de 6 cifras al chat «Mensaje a ti mismo» del cliente y devuelve {method:'code'}. Si no, devuelve {method:'support'}.
  - POST /api/account/recover/verify {number, code, password} cambia la contraseña y cierra las demás sesiones. El código dura 10 minutos y admite 5 intentos.
- **POST /api/account/password {current, password}:** cambia la contraseña y cierra las demás sesiones.
- **POST /api/account/delete {password}:** desvincula el dispositivo en WhatsApp y borra todo el espacio (`Store.purge`), la cuenta, el número y las sesiones. Responde con `Clear-Site-Data`. La cuenta demo no se puede borrar.
- **POST /api/connect** (cliente): sin vinculación vigente, pide un código nuevo (6 por hora). Si no, reconecta.
- **GET /api/admin/accounts** (solo propietario): número enmascarado, fecha, vinculación y estado. Nunca mensajes.
- **GET /.well-known/assetlinks.json:** a partir de `CONVERSA_ANDROID_PACKAGE` y `CONVERSA_ANDROID_SHA256` (huellas separadas por comas), para la app Android (TWA).
- **GET /legal/*.html|css:** páginas públicas de privacidad, condiciones y eliminación de cuenta.
- **/api/state** añade `role` ('owner'|'client') y `account` ({number, linked, demo, createdAt}). Mientras la cuenta no está vinculada, no incluye chats ni mensajes.

## Mutaciones autenticadas

- POST /api/logout y /api/revoke-sessions.
- POST /api/connect, /api/pause, /api/disconnect.
- POST /api/bot/config: enabled, mode, savedReplies[{id,name,text,keywords[]}], activeReplyId, keywordOnly, handoffAfterReply, reviewWaitMinutes; también campos heredados fallback/instructions/knowledge. La validación exacta está en Bot.configure. reviewWaitMinutes aún no ejecuta ningún temporizador.
- POST /api/bot/preview {text}: prueba privada; devuelve {text}, vacío si no hay coincidencia única en modo palabras clave. No envía a WhatsApp.
- POST /api/chat/send {jid,text}: envío manual del propietario (0.3.0). Envía el texto tal cual, sin plantillas ni IA, hasta 4000 caracteres. Igual que una respuesta desde el teléfono, pausa el bot en ese chat y pone `unread` a 0. Devuelve {id, status}: `sent`, o `uncertain` si WhatsApp no confirma en 10 s. En ese caso no se reintenta, para no duplicar el mensaje. Requiere WhatsApp conectado y un chat no borrado.
- POST /api/chat/read {jid}: marca el chat como leído (`unread` a 0). No envía confirmaciones de lectura a WhatsApp.
- POST /api/chat/send acepta `quoteId` (0.4.0): el id del mensaje al que se responde, que debe ser del mismo chat y no de visualización única. WhatsApp muestra la cita.
- POST /api/chat/react {id, emoji} (0.4.0): solo 👍 ❤️ 😂 😮 😢 🙏; un emoji vacío quita la reacción. Se envía a WhatsApp y se guarda en `reactions.me`.
- POST /api/presence {visible} (0.4.0): el panel avisa si está en pantalla. Mientras alguno lo esté (75 s de margen), no se envían notificaciones push.
- POST /api/push/subscribe {subscription} (0.4.0): solo servicios push conocidos (FCM, Mozilla, Apple, Windows) y claves válidas; como máximo 10 dispositivos. Cada suscripción queda ligada a su sesión: /api/logout borra la de ese dispositivo y /api/revoke-sessions borra todas. Ambas respuestas llevan `Clear-Site-Data: "cache"`. La cabecera `Topic` es un HMAC con clave del servidor, no el número del contacto. Además: /api/push/unsubscribe {endpoint}, /api/push/settings {preview} (false oculta nombre y texto) y /api/push/test (devuelve {sent, devices}). Un servicio que responde 404 o 410 hace que se borre esa suscripción.
- POST /api/chat/review {jid,enabled}: revisión/pausa, con prohibición de habilitar chats excluidos.
- POST /api/history/more {jid}: solicita historial usando un mensaje de referencia disponible. jid debe ser un contacto directo (@s.whatsapp.net o @lid).
- POST /api/chat/delete {jid}: borra mensajes/cola del contacto y mantiene exclusión mínima. Tratar como operación destructiva. jid debe ser un contacto directo; si no, 400 sin cambios.

## Auxiliares de prueba: revisar antes de publicar

Desde 0.2.1 ambas rutas responden 404 con NODE_ENV=production, salvo `CONVERSA_TEST_ENDPOINTS=on`. En local siguen activas; `CONVERSA_TEST_ENDPOINTS=off` también las desactiva ahí.

- POST /api/chat/send-standard-once {jid,incomingId}: envío administrativo puntual de respuesta estándar para un mensaje entrante reciente, con deduplicación. Puede actuar sobre un chat antiguo. No forma parte del flujo comercial normal.
- POST /api/bot/test {jid}: habilita por 10 minutos una prueba neutra y de un solo uso para ese contacto con palabra PRUEBA. Es independiente de enabled global y puede actuar sobre un chat antiguo. No armar en producción sin autorización específica.

La aplicación no expone alta de usuarios, selección de tenant, facturación, API móvil dedicada ni OAuth multiusuario. No asumir que estas capacidades existen por estar preparada alguna abstracción de almacenamiento.
