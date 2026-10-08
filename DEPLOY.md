> Estado actualizado de esta entrega: consultar **ENTREGA-INGENIERIA.md**. Las notas de IA y despliegue de este documento contienen contexto histórico; no indican funciones activadas ni un servidor ya publicado.

# Conversa: despliegue privado de un propietario

Preparado el 8 de octubre de 2026. No se ha contratado ni desplegado un servidor público.

## Infraestructura que falta

Un servidor Linux permanente con Docker Engine y Compose, disco persistente, acceso administrativo y un dominio/subdominio que apunte a su IP. Para el piloto, reservar inicialmente 2 GB de RAM y vigilar consumo y espacio; ajustar según el historial. Abrir 80/443 para Caddy y restringir SSH. El puerto 4318 queda interno: no publicarlo directamente.

La PC y el navegador son clientes del panel; el proceso del servidor mantiene WhatsApp. Cerrar el navegador no detiene el bot. WhatsApp aún puede revocar la sesión o exigir actividad del teléfono: no hay garantía de conexión indefinida ni de todo el historial.

## Antes del primer arranque

Copiar solo código, package.json, package-lock.json, Dockerfile, public, src, scripts y deploy. Nunca publicar `.data`, `.env.local`, copias, claves ni sesiones en Git o en la imagen.

Desde la raíz del proyecto en Linux, con Node 24 y permisos para preparar el directorio:

```sh
sudo node scripts/prepare-deploy.mjs conversa.TU-DOMINIO.com "IP-O-CIDR-PERMITIDOS"
docker compose --env-file deploy/.env -f deploy/compose.yaml build
docker compose --env-file deploy/.env -f deploy/compose.yaml up -d
```

Sustituir el dominio por uno real en minúsculas; no ejecutar el ejemplo literalmente. Caddy obtiene HTTPS para ese dominio. No se incluye su gestión DNS ni su compra.

### Restringir quién llega al panel (0.2.1)

El segundo argumento, opcional, son las IP o rangos CIDR que pueden abrir el panel, separados por espacios o comas. Por ejemplo, la IP fija de la oficina o el rango de una VPN: `"203.0.113.10/32 100.64.0.0/10"`. Se guarda como `CONVERSA_ALLOWED_IPS` en `deploy/.env`, y Caddy responde 403 a cualquier otra IP. Sin este valor no hay restricción por IP, y el script avisa. Para cambiar la lista, editar `deploy/.env` y ejecutar `docker compose --env-file deploy/.env -f deploy/compose.yaml up -d proxy`.

Comprobarlo siempre desde fuera, por ejemplo desde los datos móviles con la VPN apagada: debe responder «Acceso restringido». Si Docker publica los puertos con su proxy de espacio de usuario (por ejemplo, con IPv6 o sin iptables), Caddy ve la IP de la puerta de enlace de Docker y no la del cliente. En ese caso la lista no protege nada. Nunca añadir la puerta de enlace de Docker a la lista. Una VPN o un firewall del proveedor siguen siendo la opción recomendada para administración restringida.

### Endpoints de prueba

Con `NODE_ENV=production`, que es el valor de la imagen, /api/bot/test y /api/chat/send-standard-once responden 404. Para una prueba real puntual y autorizada, definir `CONVERSA_TEST_ENDPOINTS: "on"` en el servicio `conversa` de compose, recrear el contenedor y quitarlo al terminar.

`deploy/secrets/encryption.key` es binaria de 32 bytes; `owner-token` es un código privado hexadecimal de 64 caracteres. Guardarlos en un gestor de secretos y entregar el acceso al propietario por un canal privado. El formulario de entrada acepta el código; no compartirlo con terceros. El token no es un token de Meta ni de OpenAI. Regenerarlo revoca las sesiones existentes; la clave de cifrado NO puede regenerarse sin migrar los datos.

## Trasladar la sesión local existente

1. Preparar una copia cifrada con `node scripts/backup.mjs backup RUTA.cvb` desde la raíz local.
2. Detener la instancia local antes de iniciar WhatsApp en el servidor. Nunca mantener dos procesos para la misma sesión, ni escalar este contenedor a varias réplicas.
3. Transferir la copia cifrada y la clave original por separado mediante un canal privado. Colocar la clave original en `deploy/secrets/encryption.key`, antes de preparar un volumen con datos. Conservar también el acceso del propietario o generar uno nuevo en el destino.
4. Restaurar en un directorio vacío con `CONVERSA_DATA_DIR=...` y `CONVERSA_KEY_FILE=...`, ejecutando `node scripts/backup.mjs restore RUTA.cvb`. Corregir propietario de los archivos restaurados a UID/GID 1000, usados por la imagen.
5. Iniciar el contenedor y comprobar conexión, fecha de corte y chats excluidos. La restauración conserva reglas, cola y configuración. WhatsApp puede pedir otro QR: reconectar no reinicia el corte.

No es necesario borrar la cuenta de WhatsApp ni eliminar chats del teléfono. No copiar una base activa junto con un WAL incompleto: usar el comando de backup.

## Operación

- `docker compose --env-file deploy/.env -f deploy/compose.yaml ps` muestra estado y salud.
- `docker compose --env-file deploy/.env -f deploy/compose.yaml logs --tail=100 conversa` muestra arranques y cambios de conexión sin textos, números, QR o claves.
- La integración continua (.github/workflows/ci.yml) ejecuta las pruebas en Node 24, construye la imagen y valida el Caddyfile en cada push.
- `/healthz` solo indica que HTTP responde, NO certifica conexión con WhatsApp. El panel autenticado muestra conexión real y cola. Configurar monitoreo del servidor y del estado autenticado antes de operación desatendida; sus alertas externas todavía no están configuradas.
- Programar copias cifradas diarias y retención en el servidor elegido, separadas de la clave. Probar restauración periódicamente. Esa programación está pendiente del servidor; el comando ya funciona.
- Docker reinicia el proceso si sale o si reinicia el host. El conector reintenta fallos de red con espera creciente; una sesión revocada necesita intervención.
- Una pausa del propietario se conserva en reinicios. Un apagado del proceso no se interpreta como pausa.
- Se conserva el historial recibido sin recorte a 500. Vigilar espacio. Desde Mensajes se exportan o borran datos por contacto; una exclusión mínima cifrada evita que un contacto borrado vuelva a habilitarse. Las copias anteriores requieren su propia retención/borrado.

## Bot y alcance

La respuesta estándar y la cola están implementadas. Solo responde después de activarlo y de revisar cada chat nuevo; jamás al historial importado. STOP cancela respuestas al contacto; una intervención humana pausa su chat. Un envío cuyo resultado se desconoce queda «uncertain» y no se reenvía automáticamente; el propietario debe comprobarlo en WhatsApp.

El adaptador de IA depende de la decisión pendiente sobre la clave de OpenAI. No se ha activado ningún bot sobre los contactos reales. No hay alta de clientes, facturación de terceros ni aplicaciones de tiendas: este despliegue es exclusivo de un propietario.

## Validación antes de uso real

Construcción de imagen, arranque endurecido en Docker, reinicio y apagado abrupto probados con datos ficticios. La conexión local real se recuperó sin QR tras una actualización. Quedan por probar en el servidor contratado: HTTPS público, DNS, restauración de la sesión real allí, entrega real controlada, caída prolongada de red y observación de 24–48 horas. No afirmar disponibilidad 24/7 antes de esas pruebas.
