# Mudar Conversa a Railway (administración por web, sin SSH)

Objetivo: correr Conversa en **Railway**, donde administras todo por una página
web (desplegar, variables, registros, reiniciar). El código ya está listo
(`railway.json` + `scripts/railway-start.sh`). Hazlo por **fases**; no hay prisa.

> Enfoque recomendado: **empezar de cero** (vincular WhatsApp otra vez). Es lo
> más seguro cuando aún hay pocos datos. El servidor viejo de Hostinger sigue
> funcionando hasta que el nuevo esté probado — no se apaga nada hasta el final.

---

## Fase 1 — Crear el proyecto en Railway
1. Entra en **railway.com** y crea una cuenta (con tu Google/GitHub).
2. **New Project → Deploy from GitHub repo** → autoriza GitHub y elige
   `angeelsauro/conversaapp`, rama `claude/conversa-review-publish-131w94`.
3. Railway detecta el `Dockerfile` y empieza a construir. Deja que termine el
   primer build (puede fallar al arrancar porque aún faltan variables: normal).

## Fase 2 — Volumen de datos (persistencia)
En el servicio → pestaña **Variables/Settings** busca **Volumes** → **New Volume**:
- Mount path: **`/data`**

Ahí viven la base cifrada y la sesión de WhatsApp. **Sin volumen se pierden al redeploy.**

## Fase 3 — Variables de entorno
En **Variables**, agrega (te paso los valores secretos aparte, en un archivo):
```
NODE_ENV=production
CONVERSA_DATA_DIR=/data
PUBLIC_ORIGIN=https://<tu-dominio-del-panel>
APP_ORIGIN=https://<tu-dominio-de-la-app>
CONVERSA_OWNER_TOKEN=<código maestro de 64 caracteres — te lo doy>
CONVERSA_ENCRYPTION_KEY_B64=<clave de cifrado — te la doy>
CONVERSA_SUB_PRODUCT=conversa_mensual
CONVERSA_ANDROID_PACKAGE=com.andinamusic.conversa
```
- `PORT` lo pone Railway solo (no lo toques).
- La suscripción (`CONVERSA_REQUIRE_SUB=1`) la activamos **al final**, cuando todo funcione.

## Fase 4 — Dominios
En **Settings → Networking → Public Networking**:
- Railway te da un dominio `*.up.railway.app` para probar.
- Luego agrega tus **dominios propios** (uno para el panel, otro para la app) con
  **Custom Domain**, y en **Cloudflare (DNS)** apunta cada uno con un CNAME al
  destino que indique Railway.
- El panel queda protegido por tu **código maestro** (y, si quieres, Cloudflare
  Access delante, como ahora).

## Fase 5 — Vincular WhatsApp
Abre el panel (`https://<dominio-del-panel>/#access=<código maestro>`), entra con
tu correo si pusiste Cloudflare Access, y **vincula tu WhatsApp** con el código,
igual que la primera vez.

## Fase 6 — Verificar y cambiar la llave del dominio (assetlinks)
- Comprueba que la app abre, que entran mensajes y que el bot funciona.
- Si usas la app de Google Play, confirma el `assetlinks` con el paquete y la
  huella (igual que en `PUBLICAR-GOOGLE-PLAY.md`, paso 7).

## Fase 7 — Encender el cobro y apagar el viejo
1. Agrega `CONVERSA_REQUIRE_SUB=1` en Railway → redeploy.
2. Prueba la suscripción en el teléfono.
3. Cuando TODO funcione en Railway por unos días, apaga el servidor de Hostinger.

---

## Qué hace cada día
- Reiniciar: botón **Restart** en Railway. Registros: pestaña **Deployments/Logs**.
- Cambiar una variable: la editas en **Variables** y Railway redeploya solo.
- Actualizar la app: subes cambios a GitHub y Railway redeploya solo.

## Nota de seguridad
Guarda `CONVERSA_OWNER_TOKEN` y `CONVERSA_ENCRYPTION_KEY_B64` en tu gestor de
contraseñas. La clave de cifrado es la que abre tus datos: si la pierdes, no se
pueden leer; si la cambias, empiezas de cero.
