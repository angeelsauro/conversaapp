# Seguridad para publicar Conversa en el dominio de Andina Music

Revisión del 8 de octubre de 2026 sobre Conversa 0.2.1. Escenario pedido por el propietario: una prueba real publicada en un subdominio de Andina Music, «oculta», con el panel web solo para el propietario; más adelante, los usuarios nuevos usarían Conversa solo desde apps Android o iOS.

## Veredicto

- **Prueba real publicada, solo para el propietario: sí**, con un control de acceso delante del panel (Cloudflare Access o una VPN) y un servidor propio. Un subdominio «oculto» no basta.
- **Usuarios nuevos desde apps Android/iOS: todavía no.** No existen las apps, ni cuentas de usuario, ni separación de datos entre clientes. Ver la sección 5.
- **Riesgo principal que no es técnico:** Conversa se conecta a WhatsApp como dispositivo vinculado mediante un cliente no oficial (Baileys). Para una prueba con tu número es aceptable si asumes el riesgo de restricción. Para ofrecerlo a clientes, la vía es la API oficial (WhatsApp Business Platform).

## 1. «Oculto» no protege

Cada certificado HTTPS público queda registrado en los registros de Certificate Transparency, que cualquiera consulta (por ejemplo, en crt.sh). Un subdominio nuevo aparece ahí en minutos y los escáneres automáticos lo visitan. Un nombre poco obvio ayuda a pasar desapercibido, pero la protección real tiene que ser de identidad o de red.

## 2. Despliegue recomendado: túnel sin puertos abiertos y acceso solo para ti

```
Tu navegador → Cloudflare Access (solo tu correo + código o Google con 2FA)
             → Cloudflare Tunnel → servidor sin puertos abiertos → Conversa
```

- El servidor no expone 80 ni 443. Solo SSH con clave, idealmente limitado a tu IP o por VPN.
- Cloudflare Access rechaza a cualquiera que no sea tú antes de que la petición llegue a Conversa. Conversa sigue pidiendo además su propio código privado: son dos capas.
- Ya está preparado en `deploy/compose.tunnel.yaml`. Arranca solo Conversa y el túnel; Caddy y sus puertos quedan apagados.

Pasos (la guía paso a paso con DigitalOcean e instalador de una línea está en SERVIDOR.md):

1. Contrata un servidor Linux con Docker y disco persistente (para la prueba, 2 GB de RAM). Activa las actualizaciones automáticas de seguridad y desactiva el acceso SSH con contraseña.
2. En Cloudflare Zero Trust:
   - Crea un túnel y copia su token.
   - Añade un hostname público, por ejemplo `panel-xxxx.<dominio-de-andina-music>`, con el servicio `http://conversa:4318`.
3. En Cloudflare Zero Trust > Access, crea una aplicación «self-hosted» para ese hostname con una sola política: **Allow** → **Emails** → tu correo. Usa el código de un solo uso por correo o un proveedor con verificación en dos pasos.
4. En el servidor, desde la carpeta del proyecto:
   ```sh
   sudo node scripts/prepare-deploy.mjs panel-xxxx.<dominio-de-andina-music>
   sudo nano deploy/.env   # añade la línea CLOUDFLARE_TUNNEL_TOKEN=<token del túnel> y guarda
   sudo docker compose --env-file deploy/.env -f deploy/compose.yaml -f deploy/compose.tunnel.yaml build
   sudo docker compose --env-file deploy/.env -f deploy/compose.yaml -f deploy/compose.tunnel.yaml up -d
   ```
   El token se escribe en el editor y no en la línea de comandos, para que no quede en el historial del shell.
5. Comprueba desde un navegador privado y desde los datos móviles que Cloudflare pide identificarse, y que sin pasar por Access no se ve nada de Conversa.
6. Entra con tu correo, escribe el código de `deploy/secrets/owner-token` (guárdalo en un gestor de contraseñas) y vincula WhatsApp con el QR.

Alternativa sin Cloudflare: el `compose.yaml` original con Caddy y `CONVERSA_ALLOWED_IPS` (ver DEPLOY.md). Solo es seguro si tu IP es fija o usas una VPN. Además, hay que comprobar desde otra red que responde 403.

## 3. Lo que ya protege el código (revisado y con pruebas)

- **Acceso:** un código privado de 256 bits, comparado en tiempo constante. Las sesiones duran 12 horas, se guardan cifradas y se pueden revocar todas. Si cambias el código, se cierran todas las sesiones.
- **Cookie de sesión:** HttpOnly, Secure, SameSite=Strict y, desde 0.2.1, con prefijo `__Host-`. Así otro subdominio de Andina Music no puede plantarla ni sobrescribirla.
- **Peticiones:**
  - Toda modificación exige un `Origin` exacto y JSON; el `Host` se valida en cada petición.
  - Hay límites de tamaño y de tiempo por petición.
  - Los intentos de entrada están limitados.
- **Navegador:**
  - CSP sin scripts en línea y sin incrustación en otras webs.
  - HSTS, COOP, CORP y Permissions-Policy activas.
  - `noindex` para buscadores.
  - Los textos de los contactos siempre se muestran como texto, nunca como HTML.
- **Rutas de prueba:** `/api/bot/test` y `/api/chat/send-standard-once` responden 404 en producción. El botón «Prueba real» solo aparece en local.
- **Datos:** los valores se cifran con AES-256-GCM y los índices con HMAC. Las copias de seguridad van cifradas. Los registros no contienen mensajes, números ni códigos.
- **Contenedor:** usuario sin privilegios, sistema de archivos de solo lectura, sin capacidades extra y `no-new-privileges`. Los secretos llegan por archivos, nunca por la imagen.
- **WhatsApp:**
  - No se puede vincular otro número al mismo espacio.
  - Los chats anteriores quedan excluidos.
  - El bot solo responde a chats revisados, una vez por chat, y STOP lo detiene.

### Novedades de 0.4.0 y su protección

- **Fotos, audios y documentos:**
  - Se descargan de WhatsApp solo cuando los abres y quedan en la memoria del servidor (80 MB como máximo), nunca en disco ni en las copias de seguridad.
  - Lo único guardado (cifrado) son las claves para volver a pedirlos y la miniatura que ya trae el mensaje.
  - La visualización única nunca se guarda ni se descarga.
  - Los documentos y los tipos desconocidos se descargan como archivo y nunca se abren dentro del panel, para que un HTML o SVG malicioso no pueda ejecutarse.
  - El servidor solo descarga de `mmg.whatsapp.net`, con una ruta validada, sin redirecciones, con tiempo y tamaño máximos, y comprobando la firma del archivo. Así, un mensaje manipulado no puede llevarlo a otra dirección ni revelar su IP real.
- **Fotos de perfil:**
  - El servidor solo descarga direcciones `https` de `*.whatsapp.net`, imágenes de hasta 300 KB, de una en una.
  - Se guardan cifradas y se renuevan a diario.
- **Notificaciones push:**
  - El contenido va cifrado de extremo a extremo hasta tu dispositivo (RFC 8291). Google o Apple solo transportan bytes que no pueden leer.
  - Puedes ocultar el nombre y el texto con «Mostrar nombre y texto».
  - Solo se aceptan servicios push conocidos, para que nadie use el servidor como trampolín hacia otras direcciones.
  - Cerrar sesión en un dispositivo deja de enviarle notificaciones. «Cerrar todas las sesiones» las corta en todos.
  - El identificador de chat que ven Google o Apple es opaco: no permite deducir el número del contacto.
  - No se envían mientras el panel está en pantalla.
- **Instalación como app:** el service worker solo muestra notificaciones. No guarda páginas ni datos, así que cada apertura pasa por Cloudflare Access y por tu sesión.
- **Tiempo real (SSE):** necesita sesión, admite 8 flujos como máximo y se corta al cerrar o revocar la sesión.

### Cuentas de clientes (0.5.0)

- **Aislamiento:** cada cliente tiene su propio espacio cifrado. Cada consulta se resuelve con el espacio de la sesión, y las pruebas comprueban que un cliente no ve chats, mensajes ni archivos de otro, ni los del propietario.
- **Dos puertas separadas:** el código del propietario solo funciona en el panel privado (con Access), y las cuentas de clientes solo en la app pública. Una sesión de un lado no vale en el otro.
- **Vinculación con código:** el código de WhatsApp se pide para el número de la cuenta. Si alguien lo usa desde otro número, la vinculación se deshace al instante. Esto demuestra que el cliente controla ese WhatsApp.
- **Contraseñas:** se guardan con scrypt y una sal por cuenta. Los intentos están limitados por IP (la de Cloudflare, porque el túnel es la única entrada) y por número. La recuperación usa un código que llega al propio WhatsApp del cliente.
- **Borrado:** «Eliminar cuenta» desvincula el dispositivo y borra al instante todo lo del cliente en la base de datos. Las copias de seguridad cifradas lo conservan hasta su rotación.
- **Riesgo aceptado por Andina Music:** la conexión no oficial puede llevar a que WhatsApp restrinja números de clientes. La app lo advierte antes de vincular y exige aceptarlo.

## 4. Riesgos que quedan para la prueba publicada

| Riesgo | Qué hacer |
|---|---|
| WhatsApp restringe el número por conectarse desde un servidor con un cliente no oficial | Si puedes, usa un número de pruebas. No lo vincules en dos servidores a la vez. |
| Robo del código privado o de una sesión abierta | Access con tu correo delante del panel. Guarda el código en un gestor de contraseñas y cierra sesión en equipos compartidos. Ante cualquier duda, cambia el código. |
| Bloqueo del inicio de sesión por intentos ajenos (el límite es global detrás de un proxy) | Con Access delante, nadie ajeno llega a la pantalla de entrada. |
| Compromiso del servidor: la clave de cifrado está en el mismo servidor | Servidor dedicado, actualizado, SSH con clave y sin puertos abiertos. Copias cifradas fuera del servidor y la clave guardada aparte. |
| Pérdida de datos o de la sesión | Copia diaria con `scripts/backup.mjs` y una restauración probada (DEPLOY.md). |
| Dependencia de Baileys en versión candidata (rc) | Versión fijada con lockfile. Revisar cada actualización antes de instalarla. |
| Notificaciones en la pantalla bloqueada (nombre y texto visibles) | Desactiva «Mostrar nombre y texto» en Conexión → Notificaciones si otras personas ven tu teléfono. |
| Sin auditoría externa | Contratar una revisión de seguridad y privacidad antes de abrirlo a terceros. |

Para repetir en el servidor la prueba con PRUEBA, añade temporalmente `CONVERSA_TEST_ENDPOINTS: "on"` al servicio `conversa`, recrea el contenedor y quítalo al terminar. También puedes usar el flujo normal con una respuesta guardada y su palabra clave.

## 5. Usuarios nuevos solo desde apps Android/iOS: qué falta

Nada de esto existe hoy; el servidor actual es de un solo propietario.

1. **Backend con cuentas:** registro, inicio de sesión, recuperación, organizaciones y roles. Datos, claves, sesiones de WhatsApp, respuestas y colas separados por cliente, con pruebas de que un cliente no puede ver ni tocar lo de otro, incluso llamando a la API directamente.
2. **API propia para las apps**, en otro hostname (por ejemplo, `api.<dominio>`):
   - Tokens de corta duración con renovación, ligados al dispositivo.
   - El código del propietario nunca sale del panel.
   - El panel web sigue detrás de Access, solo para ti.
3. **«Solo desde la app»** no se puede garantizar al 100 %: cualquiera puede imitar una app. Se dificulta con Play Integrity (Android) y App Attest (iOS), verificados en el servidor, pero el servidor debe autorizar cada acción igualmente.
4. **WhatsApp para clientes:** conectar las cuentas de terceros con un cliente no oficial va contra las condiciones de WhatsApp, expone a bloqueos y puede hacer que Apple o Google rechacen las apps. La vía adecuada es la WhatsApp Business Platform (Cloud API), con empresa verificada y consentimiento de los destinatarios.
5. **Tiendas y legal:**
   - Política de privacidad y borrado de datos desde la app.
   - Formularios de privacidad de Google Play y App Store.
   - Cumplir la ley de protección de datos aplicable; en Perú, por ejemplo, la Ley 29733.

## 6. Orden recomendado

1. **Ahora:** prueba real publicada solo para ti, con túnel y Access (sección 2).
2. **Después:**
   - Decidir entre la API oficial de WhatsApp y Baileys para clientes.
   - Diseñar el backend multiusuario y la API de las apps.
3. **Al final:** apps Android/iOS, auditoría externa y publicación en tiendas.

## Prueba real ya realizada (8 de octubre de 2026)

El propietario la autorizó y se hizo desde un entorno de nube:

- **Conexión:** se permitieron `web.whatsapp.com` y `*.whatsapp.net` en la red, y la conexión de WhatsApp salió por el proxy del entorno.
- **Privacidad:** sin descarga de historial.
- **Vinculación:** el QR se escaneó con el número del propietario.
- **Prueba:** un contacto escribió «Hola» y se activó la prueba PRUEBA para ese chat.
- **Resultado:** al recibir `PRUEBA`, Conversa respondió una sola vez «Mensaje de prueba recibido correctamente.» en menos de 2 segundos. El chat pasó a revisión y la prueba quedó consumida.
- **Cierre:** se pausó la recepción, se desvinculó la sesión de WhatsApp y se borraron todos los datos de la prueba.
