> Estado actualizado de esta entrega: consultar **ENTREGA-INGENIERIA.md**. Las notas de IA y despliegue de este documento contienen contexto histórico; no indican funciones activadas ni un servidor ya publicado.

# Conversa QR 0.2 — espacio privado

Servidor Node 24 para vincular un WhatsApp por QR, importar el historial directo disponible y atender chats nuevos revisados. Versión de un propietario; no es todavía una plataforma pública para múltiples clientes.

## Abrir

Prueba real con tu WhatsApp: seguir [PRUEBA-REAL.md](PRUEBA-REAL.md).


Ejecutar `Abrir-Conversa.ps1` en Windows. El panel local es http://127.0.0.1:4318/. El archivo abre el acceso privado sin imprimirlo. No compartir el enlace con fragmento de acceso.

Para desarrollo: `npm ci`, `npm test`, `npm start`. Para ver el panel con datos ficticios, sin WhatsApp: `npm run preview` (http://127.0.0.1:4319), o `npm run demo` para generar `dist/conversa-demo.html`, un archivo que se abre con doble clic. No ejecutar dos servidores sobre la misma carpeta de datos. La instancia local escucha solamente en loopback.

## Historial y regla de respuesta

- Se habilita la sincronización de historial de Baileys, se guardan mensajes directos recibidos por sincronización, notify y append; no se descartan por reiniciar ni se recorta a 500.
- WhatsApp determina cuánto historial entrega. No se promete importación completa, archivos adjuntos completos, grupos ni mensajes ya eliminados. Los medios se representan por tipo.
- Una primera vinculación nueva guarda una fecha inmutable. La sesión del piloto anterior no registraba esa fecha: se usa el momento de actualización como corte conservador, excluyendo conversaciones previas a ese corte. Se señala en el panel.
- Si aparece cualquier mensaje anterior al corte, el chat queda excluido permanentemente. Llegar un mensaje nuevo del mismo contacto no lo habilita.
- Si solo se recibe historial parcial, el chat queda sin verificar. El propietario debe comprobar en su teléfono que es nuevo antes de habilitarlo. No hay una prueba protocolaria universal de que un chat sin historial sea realmente nuevo.
- En Mensajes: revisar/pausar chat, solicitar más historial, exportar y borrar. Un borrado conserva una exclusión cifrada para impedir reactivación e importación posterior. Las copias anteriores no se purgan automáticamente.

## Bot

Mi bot permite guardar respuesta estándar, instrucciones y conocimiento, y simular una pregunta sin enviar mensajes. El modo estándar responde con el texto configurado. Los campos de instrucciones/conocimiento están preparados para IA, cuyo adaptador aún depende de la decisión sobre la clave existente; actualmente el modo IA no está habilitado.

La activación global es explícita y separada del permiso por chat. No se encola historial ni mensajes anteriores a la activación. Se deduplica por ID incluso entre identidades PN/LID conocidas. La cola persiste, tiene un límite de 60 intentos de envío por hora, omite mensajes con más de 24 horas y vuelve a revisar permisos antes de enviar. STOP cancela respuestas; un mensaje humano enviado desde la cuenta pausa el chat. No se envían campañas.

Un envío interrumpido puede haberse entregado: queda incierto y nunca se reintenta automáticamente. Esto evita reintentos ciegos, pero no garantiza entrega exactamente una vez frente al comportamiento de servicios externos. Las generaciones interrumpidas se recuperan; el historial no provoca respuestas retrospectivas.

## Seguridad y continuidad

Valores cifrados con AES-256-GCM, índices sensibles con HMAC, transacciones para claves, protección contra escrituras de sockets antiguos, bloqueo de instancia, cookies privadas con expiración, sesiones persistentes y revocación, Origin/Host explícitos, CSP, límites de peticiones y acceso privado a QR/mensajes.

La nube exige HTTPS y archivos externos para las claves. Localmente la clave sigue en `.data`, protegida por permisos: copiar esa carpeta completa permite descifrarla. Conservar las copias y sus claves por separado.

El estado activo/pausado persiste; el servidor reanuda una sesión activa después de reiniciar y reintenta caídas de red. Una sesión revocada exige otro QR; un reemplazo por otro proceso detiene esta instancia. El navegador muestra claramente si pierde contacto con el servidor.

## Despliegue y operaciones

Ver [DEPLOY.md](DEPLOY.md). Hay Dockerfile, Compose, Caddy/HTTPS, comprobación HTTP, proceso sin privilegios y volumen persistente. Para responder con PC y móvil apagados hace falta instalarlo en un servidor permanente. **Todavía no se ha contratado ni desplegado ese servidor.**

Copias: `node scripts/backup.mjs backup ruta.cvb`. Restauración con la misma clave en destino vacío: `node scripts/backup.mjs restore ruta.cvb`. Nunca sobrescribe datos existentes. Ver variables en DEPLOY.md.

## Límites pendientes

IA y entrenamiento, prueba controlada real de envío, monitor externo y programación de copias en el host elegido, validación de HTTPS/DNS y observación prolongada. Múltiples usuarios y tiendas móviles quedan para la siguiente etapa. La conexión por QR utiliza un cliente no oficial: cambios o restricciones de WhatsApp pueden requerir intervención; no se garantiza continuidad indefinida.
