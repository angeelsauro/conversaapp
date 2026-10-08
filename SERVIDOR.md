# Publicar Conversa en un servidor (DigitalOcean + Cloudflare)

- **Tiempo:** unos 30 minutos.
- **Coste:** desde unos 6 USD al mes (Droplet de 1 GB; el instalador añade memoria de intercambio). Confirma el precio en la pantalla de DigitalOcean.
- **Resultado:** el panel queda en `https://panel-xxxx.<tu dominio>` y solo se entra con tu correo (Cloudflare Access) y con el código privado de Conversa. El servidor no tiene puertos web abiertos. Los motivos están en SEGURIDAD-PUBLICACION.md.

Los nombres de los menús pueden variar un poco según la versión del panel de cada servicio.

## 1. Cloudflare Access (primero)

1. Entra en dash.cloudflare.com → **Zero Trust**. La primera vez te pide un nombre de equipo y un plan: elige **Free**. Puede pedirte una tarjeta aunque el plan sea gratis.
2. Ve a **Access** → **Applications** → **Add an application** → **Self-hosted**.
3. Ponle el nombre `Conversa`. Como dominio, inventa un subdominio poco obvio de tu dominio, por ejemplo `panel-7k2q`.
4. En la política elige **Allow** → **Include** → **Emails** → tu correo, y guarda.

## 2. Túnel de Cloudflare

1. En Zero Trust, ve a **Networks** → **Tunnels** → **Create a tunnel** → **Cloudflared** y ponle el nombre `conversa`.
2. En la pantalla de instalación elige **Docker**. Copia solo el texto largo que aparece después de `--token`: es el token del túnel y no debes compartirlo.
3. En **Public hostname**, pon el mismo subdominio y dominio del paso 1. En **Service**, elige `HTTP` con la URL `conversa:4318`, y guarda.

## 3. Token de GitHub (para descargar el código privado)

1. En github.com, ve a **Settings** → **Developer settings** → **Personal access tokens** → **Fine-grained tokens** → **Generate new token**.
2. Configúralo así:
   - **Expiración:** 7 días.
   - **Repository access:** **Only select repositories** → `angeelsauro/conversaapp`.
   - **Permissions:** **Contents: Read-only**.
3. Pulsa **Generate token** y cópialo.

## 4. Servidor en DigitalOcean

1. En cloud.digitalocean.com, ve a **Create** → **Droplets**.
2. Elige:
   - **Región:** New York.
   - **Imagen:** Ubuntu 24.04 (LTS).
   - **Tamaño:** configuración **Bundled** → **Basic** → **Regular** → el plan de **1 GB** (unos 6 USD al mes) o el de 2 GB.
3. En **Authentication** elige **Password**, con una contraseña larga guardada en tu gestor de contraseñas. Después pulsa **Create Droplet**.
4. Cuando esté listo, abre el Droplet → **Access** → **Launch Droplet Console**.

## 5. Instalar (una sola línea)

Pega esto en la consola y pulsa Enter:

```sh
read -rsp 'Token de GitHub: ' GH_TOKEN && echo && export GH_TOKEN && curl -fsSL -H "Authorization: Bearer $GH_TOKEN" -H "Accept: application/vnd.github.raw" "https://api.github.com/repos/angeelsauro/conversaapp/contents/scripts/install-server.sh?ref=claude/conversa-review-publish-131w94" | bash
```

Te pedirá tres datos: el token de GitHub, el subdominio completo (por ejemplo `panel-7k2q.tudominio.com`) y el token del túnel. Los tokens no se ven mientras los escribes. La instalación tarda unos 5 minutos.

## 6. Entrar y vincular WhatsApp

1. Abre `https://panel-7k2q.tudominio.com`. Cloudflare te enviará un código a tu correo.
2. En la consola del Droplet, escribe `cat /opt/conversa/deploy/secrets/owner-token`. Ese es tu código privado de Conversa: guárdalo en tu gestor.
3. En el panel, ve a **Conexión** → **Generar QR** y escanéalo con WhatsApp → **Dispositivos vinculados**.
4. Si la prueba de antes se hizo con tu número, no vuelvas a vincularlo en otro lugar al mismo tiempo.

## Actualizar o revisar

- **Actualizar:** vuelve a pegar la misma línea del paso 5, con un token de GitHub vigente. Se conservan los datos, las claves y la sesión de WhatsApp.
- **Ver errores:** `cd /opt/conversa && docker compose --env-file deploy/.env -f deploy/compose.yaml -f deploy/compose.tunnel.yaml logs --tail=50`
- **Copias de seguridad y restauración:** ver DEPLOY.md.
