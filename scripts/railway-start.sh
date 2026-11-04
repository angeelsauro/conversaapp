#!/bin/sh
# Arranque para plataformas con variables de entorno (Railway, Render…), que no
# tienen "secretos de Docker". Deja los secretos como archivos en el volumen y
# arranca el servidor. No afecta al despliegue con Docker Compose (ese usa su CMD).
set -e

DATA="${CONVERSA_DATA_DIR:-/data}"
SEC="$DATA/secrets"
mkdir -p "$SEC"

# Clave de cifrado (32 bytes). Si se pasa CONVERSA_ENCRYPTION_KEY_B64 y aún no
# existe el archivo, se usa esa (para CONSERVAR datos de otra instalación).
# Si no existe ninguna, se genera una nueva (instalación desde cero).
if [ ! -f "$SEC/encryption.key" ]; then
  if [ -n "$CONVERSA_ENCRYPTION_KEY_B64" ]; then
    printf '%s' "$CONVERSA_ENCRYPTION_KEY_B64" | base64 -d > "$SEC/encryption.key"
  else
    head -c 32 /dev/urandom > "$SEC/encryption.key"
  fi
  chmod 600 "$SEC/encryption.key" 2>/dev/null || true
fi
export CONVERSA_KEY_FILE="$SEC/encryption.key"

# Código maestro de propietario (64 hex). Si se pasa CONVERSA_OWNER_TOKEN, se usa
# ese (así lo conoces para entrar al panel). Si no, el servidor genera uno.
if [ -n "$CONVERSA_OWNER_TOKEN" ] && [ ! -f "$SEC/owner-token" ]; then
  printf '%s' "$CONVERSA_OWNER_TOKEN" | tr -d '[:space:]' > "$SEC/owner-token"
  chmod 600 "$SEC/owner-token" 2>/dev/null || true
fi
export CONVERSA_OWNER_TOKEN_FILE="$SEC/owner-token"

# Enlazar en todas las interfaces (la plataforma expone el puerto por HTTPS).
export HOST="${HOST:-0.0.0.0}"
export NODE_ENV="${NODE_ENV:-production}"

exec node src/server.mjs
