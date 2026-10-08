#!/usr/bin/env bash
# Instala o actualiza Conversa en un servidor Ubuntu 24.04 sin puertos abiertos (Cloudflare Tunnel + Access).
# Se ejecuta como root desde la consola del proveedor (ver SERVIDOR.md). Pregunta el subdominio y el token del
# túnel la primera vez; no guarda el token de GitHub y no imprime secretos. Volver a ejecutarlo actualiza el código
# y conserva datos, claves y sesión de WhatsApp.
set -euo pipefail
REPO="angeelsauro/conversaapp"
BRANCH="${CONVERSA_BRANCH:-claude/conversa-review-publish-131w94}"
DIR="${CONVERSA_DIR:-/opt/conversa}"
ask() { # ask VAR "prompt" [secret]: reads from the terminal even when this script arrives through a pipe.
  local var=$1 prompt=$2
  [ -n "${!var:-}" ] && return
  if [ -n "${3:-}" ]; then read -rsp "$prompt" "$var" </dev/tty; echo; else read -rp "$prompt" "$var" </dev/tty; fi
  [ -n "${!var}" ] || { echo "Falta un dato; vuelve a ejecutar el instalador."; exit 1; }
}
[ "$(id -u)" = 0 ] || { echo "Ejecútalo como root (en la consola del Droplet ya lo eres)."; exit 1; }
if [ ! -f "$DIR/deploy/.env" ]; then
  ask CONVERSA_DOMAIN 'Subdominio del panel (ej. panel-7k2q.tudominio.com): '
  ask CLOUDFLARE_TUNNEL_TOKEN 'Token del túnel de Cloudflare: ' secret
fi
[ -n "${CONVERSA_SOURCE_DIR:-}" ] || ask GH_TOKEN 'Token de GitHub (solo lectura): ' secret

echo "1/5 Sistema: actualizaciones automáticas de seguridad y cortafuegos (solo SSH entrante)"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq >/dev/null
apt-get install -y -qq ca-certificates curl ufw fail2ban unattended-upgrades >/dev/null
{ ufw allow OpenSSH >/dev/null && ufw --force enable >/dev/null; } || echo "   Aviso: no se pudo activar el cortafuegos ufw; revísalo a mano."

echo "2/5 Docker"
command -v docker >/dev/null || curl -fsSL https://get.docker.com | sh >/dev/null 2>&1

echo "3/5 Código de Conversa ($BRANCH)"
src=$(mktemp -d)
if [ -n "${CONVERSA_SOURCE_DIR:-}" ]; then cp -a "$CONVERSA_SOURCE_DIR/." "$src/"
else curl -fsSL -H "Authorization: Bearer $GH_TOKEN" -H "Accept: application/vnd.github+json" "https://api.github.com/repos/$REPO/tarball/$BRANCH" | tar -xz -C "$src" --strip-components=1
fi
mkdir -p "$DIR"
# Code only: deploy/data, deploy/secrets and deploy/.env are not in the repository and are kept as they are.
cp -a "$src/." "$DIR/" && rm -rf "$src"
cd "$DIR"

echo "4/5 Secretos y arranque"
if [ ! -f deploy/.env ]; then
  # prepare-deploy creates the encryption key and the owner code with the right owner (uid 1000), without printing them.
  docker run --rm -v "$DIR:/app" -w /app node:24-bookworm-slim node scripts/prepare-deploy.mjs "$CONVERSA_DOMAIN" >/dev/null
  umask 077; printf 'CLOUDFLARE_TUNNEL_TOKEN=%s\n' "$CLOUDFLARE_TUNNEL_TOKEN" >> deploy/.env
fi
compose=(docker compose --env-file deploy/.env -f deploy/compose.yaml -f deploy/compose.tunnel.yaml)
"${compose[@]}" build -q
"${compose[@]}" up -d --remove-orphans

echo "5/5 Comprobando"
for _ in $(seq 1 30); do "${compose[@]}" exec -T conversa node scripts/healthcheck.mjs 2>/dev/null && ok=1 && break; sleep 2; done
[ "${ok:-}" = 1 ] || { echo "Conversa no responde. Revisa: ${compose[*]} logs --tail=50 conversa"; exit 1; }
domain=$(sed -n 's/^CONVERSA_DOMAIN=//p' deploy/.env)
cat <<EOF

Listo: Conversa funciona detrás del túnel y el servidor no tiene puertos web abiertos.
1. Abre https://$domain (Cloudflare te pedirá tu correo).
2. Para ver tu código privado de Conversa, escribe aquí:  cat $DIR/deploy/secrets/owner-token
   Guárdalo en un gestor de contraseñas y no lo compartas.
Para actualizar Conversa más adelante, vuelve a pegar la misma línea de instalación.
EOF
