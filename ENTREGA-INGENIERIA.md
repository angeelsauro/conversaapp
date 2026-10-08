# Entrega técnica de Conversa

Fecha: 8 de octubre de 2026. Snapshot del proyecto Conversa QR 0.2.0.

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

npm start crea la base y las credenciales de acceso locales. El bot empieza desactivado. Los textos y palabras clave guardados en la instancia del propietario no están incluidos: son datos privados de ejecución. El puerto debe estar libre.

## Arquitectura

- public/index.html, styles.css, app.js: interfaz sin framework, lista/detalle de chats, diseño móvil, sonidos optativos, biblioteca y prueba privada de respuestas.
- src/server.mjs: HTTP, autenticación por cookie, rutas privadas, límites, Origin/Host, CSP y arranque.
- src/connector.mjs: sesión Baileys, QR, eventos, reconexión y persistencia de credenciales.
- src/history.mjs: mensajes, clasificación de chats, fecha de corte, alias PN/LID y exclusiones.
- src/bot.mjs: textos guardados, coincidencia de palabras clave, cola persistente y traspaso a revisión.
- src/store.mjs: SQLite, valores cifrados AES-GCM e índices HMAC.
- src/lock.mjs: exclusión de procesos concurrentes.
- scripts/: respaldo/restauración cifrados, preparación de despliegue y healthcheck.
- test/: pruebas aisladas con datos ficticios; no necesitan WhatsApp real.

Baileys usa una conexión de dispositivo vinculado no oficial. No se garantiza historial completo, conexión permanente ni aceptación de la cuenta por WhatsApp. Mantener los requisitos/licencias de dependencias, revisar riesgos de actualización y restricciones del proveedor antes de operar.

## Implementado y probado

- Vinculación QR y recuperación de sesión persistida; pausa explícita conservada.
- Almacenamiento del historial recibido; representación de medios por tipo, sin descarga de imágenes.
- Exclusión de chats anteriores a la fecha de corte; ausencia de historial no demuestra que un contacto sea nuevo. Se exige revisión para habilitar chats nuevos.
- Biblioteca de hasta 20 respuestas, con textos exactos y palabras/frases configuradas manualmente; normalización de mayúsculas y tildes, no interpretación semántica.
- keywordOnly: sin coincidencia única no se envía texto. Revisión es un estado interno, no un aviso al contacto.
- handoffAfterReply: pausa después de una respuesta, evitando posteriores envíos en ese chat.
- Cola, deduplicación, validación antes del envío y tratamiento conservador de estados inciertos. No equivale a garantía distribuida de entrega exactamente una vez.
- STOP y mensajes propios detienen la respuesta automática.
- Visualización única: marcador sin desenvolver/descargar contenido, detención y revisión inmediata; propagación al combinar alias.
- Panel de PC y móvil, búsqueda, filtros, opciones por chat y sonido optativo mientras el navegador lo permite. No hay push con la aplicación cerrada.
- Autenticación, protección de origen/host, cifrado, revocación de sesiones y respaldos/restauración.

## Resultado de verificación

En esta entrega: npm test, 20 pruebas aprobadas, 0 fallidas, Node 24 en Windows. Se probaron coincidencias, exclusiones, reconexión, persistencia, cifrado, cola y medios de visualización única. El diseño se revisó en viewports 375, 390, 430, 768, 1440 y 1728 píxeles; no sustituye pruebas físicas en Android/iOS ni auditoría de accesibilidad independiente. Hubo una prueba real autorizada con un texto neutro, confirmada por el propietario. No se activa el bot general como parte de la entrega.

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
2. El compose incluido publica 80/443 mediante Caddy. Una pantalla autenticada NO convierte al servidor en una red privada. El requisito del propietario es administración restringida: diseñar VPN/control de acceso o aislamiento antes de publicar. Usar DNS no aporta privacidad por sí solo.
3. Diseñar autenticación individual y autorización/aislamiento de datos antes de ofrecer el servicio a terceros. El producto actual usa el workspace owner y no es multiusuario.
4. Revisar los endpoints auxiliares /api/chat/send-standard-once y /api/bot/test. Son accesos administrativos autenticados de prueba y permiten una excepción puntual a chats antiguos; el segundo caduca a los 10 minutos y usa un texto neutro fijo. Deshabilitar o restringir explícitamente para producción; no confundir con activación general.
5. Verificar límites, idempotencia, errores de red, estados inciertos, registros sin datos privados y comportamiento tras revocación de sesión.
6. Revisar consentimiento de destinatarios, tratamiento de datos y compatibilidad con las condiciones de WhatsApp. No afirmar que el historial parcial permite detectar con certeza absoluta todos los chats nuevos.

No se incluyen credenciales ni acceso a Cloudflare, Meta, DNS, proveedores de IA o tiendas. Gestionarlos por canales privados y con permisos mínimos si fueran necesarios.

## Documentos de esta entrega comercial

Leer también ALCANCE-PRODUCTO.md (producto determinista sin IA generativa, requisitos multiusuario y publicación) y API-REVISION.md (rutas actuales y endpoints auxiliares a restringir). El paquete contiene todos los archivos fuente del proyecto QR actual; las exclusiones de datos privados son deliberadas, no funciones faltantes. Los otros prototipos del workspace y cuentas de proveedores externos no son parte de este servidor independiente.
