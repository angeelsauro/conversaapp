#!/usr/bin/env bash
# Instala o actualiza Conversa en un servidor Ubuntu 24.04 o posterior sin puertos abiertos (Cloudflare Tunnel + Access).
# Se ejecuta como root desde la consola del proveedor (ver SERVIDOR.md). Pregunta el subdominio y el token del
# túnel la primera vez; no guarda el token de GitHub y no imprime secretos. Volver a ejecutarlo actualiza el código
# y conserva datos, claves y sesión de WhatsApp. Con «--token» vuelve a pedir el token del túnel y lo reemplaza.
set -euo pipefail
REPO="angeelsauro/conversaapp"
BRANCH="${CONVERSA_BRANCH:-claude/conversa-review-publish-131w94}"
DIR="${CONVERSA_DIR:-/opt/conversa}"

ask() { # ask VAR "prompt" [secret]: reads from the terminal even when this script arrives through a pipe.
  local var=$1 prompt=$2 value
  if [ -z "${!var:-}" ]; then
    if [ -n "${3:-}" ]; then read -rsp "$prompt" value </dev/tty; echo; else read -rp "$prompt" value </dev/tty; fi
    printf -v "$var" '%s' "$value"
  fi
  # Pasting from Windows terminals can add spaces or invisible carriage returns: tokens and hostnames never contain them.
  printf -v "$var" '%s' "$(printf '%s' "${!var}" | tr -d '[:space:]')"
  [ -n "${!var}" ] || { echo "Falta un dato; vuelve a ejecutar el instalador."; exit 1; }
}

main() { # Everything runs inside a function, so bash has read the whole script before any command can touch stdin.
  [ "$(id -u)" = 0 ] || { echo "Ejecútalo como root."; exit 1; }
  local new_token=""; [ "${1:-}" = "--token" ] && new_token=1
  if [ ! -f "$DIR/deploy/.env" ]; then ask CONVERSA_DOMAIN 'Subdominio del panel (ej. panel-7k2q.tudominio.com): '; fi
  if [ -n "$new_token" ] || [ ! -f "$DIR/deploy/.env" ] || ! grep -q '^CLOUDFLARE_TUNNEL_TOKEN=.' "$DIR/deploy/.env"; then
    ask CLOUDFLARE_TUNNEL_TOKEN 'Token del túnel de Cloudflare (o el comando completo de Cloudflare): ' secret
    # Accept the whole "docker run ... --token eyJ..." command too: keep only the token, which is base64 JSON starting with eyJ.
    CLOUDFLARE_TUNNEL_TOKEN=$(printf '%s' "$CLOUDFLARE_TUNNEL_TOKEN" | sed 's/--token//' | grep -oE 'eyJ[A-Za-z0-9_+/=-]{40,}' | head -n1 || true)
    printf '%s' "$CLOUDFLARE_TUNNEL_TOKEN" | base64 -d 2>/dev/null | grep -q '"t"' || { echo "Eso no parece un token de túnel de Cloudflare (empieza por eyJ). Vuelve a copiarlo."; exit 1; }
  fi
  [ -n "${CONVERSA_SOURCE_DIR:-}" ] || ask GH_TOKEN 'Token de GitHub (solo lectura): ' secret

  echo "1/5 Sistema: actualizaciones automáticas de seguridad y cortafuegos (solo SSH entrante)"
  export DEBIAN_FRONTEND=noninteractive
  # A fresh server is usually still running cloud-init and automatic updates: wait for them instead of failing on the apt lock.
  if command -v cloud-init >/dev/null; then cloud-init status --wait >/dev/null 2>&1 </dev/null || true; fi
  echo 'DPkg::Lock::Timeout "600";' > /etc/apt/apt.conf.d/99conversa-lock-wait
  apt-get update -qq >/dev/null </dev/null
  apt-get install -y -qq ca-certificates curl ufw fail2ban unattended-upgrades >/dev/null </dev/null
  { ufw allow OpenSSH >/dev/null && ufw --force enable >/dev/null; } </dev/null || echo "   Aviso: no se pudo activar el cortafuegos ufw; revísalo a mano."
  # Small plans (1 GB): add 2 GB of swap so building the image and running Conversa never run out of memory.
  if [ "$(awk '/MemTotal/{print $2}' /proc/meminfo)" -lt 1900000 ] && ! swapon --show | grep -q .; then
    { fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile >/dev/null && swapon /swapfile && echo '/swapfile none swap sw 0 0' >> /etc/fstab; } || echo "   Aviso: no se pudo crear la memoria de intercambio."
  fi

  echo "2/5 Docker"
  if ! command -v docker >/dev/null; then
    curl -fsSL https://get.docker.com | sh >/dev/null 2>&1 || true
    # Very new Ubuntu releases can arrive before Docker publishes packages for them: fall back to Ubuntu's own Docker.
    if ! command -v docker >/dev/null; then
      apt-get install -y -qq docker.io docker-compose-v2 >/dev/null </dev/null
      apt-get install -y -qq docker-buildx >/dev/null 2>&1 </dev/null || true
    fi
  fi
  docker compose version >/dev/null 2>&1 || apt-get install -y -qq docker-compose-v2 >/dev/null </dev/null
  systemctl enable --now docker >/dev/null 2>&1 || true

  echo "3/5 Código de Conversa ($BRANCH)"
  local src; src=$(mktemp -d)
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
    docker run --rm -v "$DIR:/app" -w /app node:24-bookworm-slim node scripts/prepare-deploy.mjs "$CONVERSA_DOMAIN" >/dev/null </dev/null
  fi
  if [ -n "${CLOUDFLARE_TUNNEL_TOKEN:-}" ]; then
    (umask 077; { grep -v '^CLOUDFLARE_TUNNEL_TOKEN=' deploy/.env || true; printf 'CLOUDFLARE_TUNNEL_TOKEN=%s\n' "$CLOUDFLARE_TUNNEL_TOKEN"; } > deploy/.env.new && mv deploy/.env.new deploy/.env)
  fi
  local compose=(docker compose --env-file deploy/.env -f deploy/compose.yaml -f deploy/compose.tunnel.yaml)
  "${compose[@]}" build -q </dev/null
  "${compose[@]}" up -d --remove-orphans --force-recreate </dev/null

  echo "5/5 Comprobando"
  local ok="" tunnel=""
  for _ in $(seq 1 30); do "${compose[@]}" exec -T conversa node scripts/healthcheck.mjs </dev/null >/dev/null 2>&1 && ok=1 && break; sleep 2; done
  [ -n "$ok" ] || { echo "Conversa no responde. Últimos registros:"; "${compose[@]}" logs --tail=30 conversa </dev/null; exit 1; }
  for _ in $(seq 1 20); do "${compose[@]}" logs tunnel </dev/null 2>&1 | grep -q 'Registered tunnel connection' && tunnel=1 && break; sleep 2; done
  if [ -z "$tunnel" ]; then
    echo "Conversa funciona, pero el túnel de Cloudflare no conecta. Últimos registros del túnel:"
    "${compose[@]}" logs --tail=15 tunnel </dev/null
    echo "Si dice que el token no es válido, vuelve a pegar la línea de instalación añadiendo  -s -- --token  después de  bash."
    exit 1
  fi
  local domain; domain=$(sed -n 's/^CONVERSA_DOMAIN=//p' deploy/.env)
  cat <<EOF

Listo: Conversa funciona detrás del túnel y el servidor no tiene puertos web abiertos.
1. Abre https://$domain (Cloudflare te pedirá tu correo).
2. Para ver tu código privado de Conversa, escribe aquí:  cat $DIR/deploy/secrets/owner-token
   Guárdalo en un gestor de contraseñas y no lo compartas.
Para actualizar Conversa más adelante, vuelve a pegar la misma línea de instalación.
EOF
}

main "$@"
