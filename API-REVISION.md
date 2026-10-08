# Mapa de API actual para revisión

Base local: http://127.0.0.1:4318. Consultar src/server.mjs como fuente de verdad. Sin contrato de compatibilidad comercial todavía.

## Acceso

POST /api/login recibe {token} del código privado creado localmente. Cookie HttpOnly y SameSite=Strict; Secure con origen HTTPS. POST exige Origin permitido y Content-Type application/json. GET privados requieren sesión; /healthz y archivos públicos no requieren sesión. No incluir tokens, cookies ni claves en issues o capturas.

## Lectura autenticada

- GET /api/state: conexión, primeros mensajes, chats, configuración, estados de cola, datos del workspace. Desde 0.2.1 incluye `tests` (si las rutas de prueba están activas) y `keywordTest` ({jid, expiresAt, consumedAt} de la prueba PRUEBA, o null).
- GET /api/messages?offset=N: página adicional de mensajes; conversationJid normaliza alias para interfaz.
- GET /api/export: exportación de mensajes y chats. Contiene datos privados, nunca adjuntarla al paquete público.

## Mutaciones autenticadas

- POST /api/logout y /api/revoke-sessions.
- POST /api/connect, /api/pause, /api/disconnect.
- POST /api/bot/config: enabled, mode, savedReplies[{id,name,text,keywords[]}], activeReplyId, keywordOnly, handoffAfterReply, reviewWaitMinutes; también campos heredados fallback/instructions/knowledge. La validación exacta está en Bot.configure. reviewWaitMinutes aún no ejecuta ningún temporizador.
- POST /api/bot/preview {text}: prueba privada; devuelve {text}, vacío si no hay coincidencia única en modo palabras clave. No envía a WhatsApp.
- POST /api/chat/review {jid,enabled}: revisión/pausa, con prohibición de habilitar chats excluidos.
- POST /api/history/more {jid}: solicita historial usando un mensaje de referencia disponible. jid debe ser un contacto directo (@s.whatsapp.net o @lid).
- POST /api/chat/delete {jid}: borra mensajes/cola del contacto y mantiene exclusión mínima. Tratar como operación destructiva. jid debe ser un contacto directo; si no, 400 sin cambios.

## Auxiliares de prueba: revisar antes de publicar

Desde 0.2.1 ambas rutas responden 404 con NODE_ENV=production, salvo `CONVERSA_TEST_ENDPOINTS=on`. En local siguen activas; `CONVERSA_TEST_ENDPOINTS=off` también las desactiva ahí.

- POST /api/chat/send-standard-once {jid,incomingId}: envío administrativo puntual de respuesta estándar para un mensaje entrante reciente, con deduplicación. Puede actuar sobre un chat antiguo. No forma parte del flujo comercial normal.
- POST /api/bot/test {jid}: habilita por 10 minutos una prueba neutra y de un solo uso para ese contacto con palabra PRUEBA. Es independiente de enabled global y puede actuar sobre un chat antiguo. No armar en producción sin autorización específica.

La aplicación no expone alta de usuarios, selección de tenant, facturación, API móvil dedicada ni OAuth multiusuario. No asumir que estas capacidades existen por estar preparada alguna abstracción de almacenamiento.
