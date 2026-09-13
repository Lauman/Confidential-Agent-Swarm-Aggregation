#!/bin/sh
# Shared entrypoint for Fly.io.
# Usage: docker-entrypoint.sh [coordinator|resource-server]
# - Writes KEYMAP_JSON / DEV_SECRETS_JSON secrets to files when provided
# - Falls back to ephemeral keygen (demo mode) so first deploy boots
set -eu

SERVICE="${1:-coordinator}"
KEYS_DIR="/app/.keys"
mkdir -p "$KEYS_DIR"

if [ -n "${KEYMAP_JSON:-}" ]; then
  printf '%s' "$KEYMAP_JSON" > "$KEYS_DIR/keymap.json"
  export KEYMAP_PATH="$KEYS_DIR/keymap.json"
fi
if [ -n "${DEV_SECRETS_JSON:-}" ]; then
  printf '%s' "$DEV_SECRETS_JSON" > "$KEYS_DIR/dev-secrets.json"
  export DEV_SECRETS_PATH="$KEYS_DIR/dev-secrets.json"
fi

if [ ! -f "${KEYMAP_PATH:-/app/.keys/keymap.json}" ] && [ ! -f "/app/packages/confidential-core/.dev-keys/keymap.json" ]; then
  echo "[entrypoint] no keymap found — generating ephemeral keys (demo mode)"
  node -e "
    import('/app/packages/confidential-core/dist/tee/keymap.js').then(async (m) => {
      const fs = await import('node:fs');
      const mat = await m.generateKeyMaterial(['agent-1','agent-2','agent-3']);
      fs.mkdirSync('$KEYS_DIR', { recursive: true });
      fs.writeFileSync('$KEYS_DIR/keymap.json', JSON.stringify(m.toKeymap(mat), null, 2));
      fs.writeFileSync('$KEYS_DIR/dev-secrets.json', JSON.stringify(m.toDevSecrets(mat), null, 2));
      console.log('[entrypoint] ephemeral keys written');
    }).catch((e) => { console.error('[entrypoint] keygen failed', e); process.exit(1); });
  "
  export KEYMAP_PATH="$KEYS_DIR/keymap.json"
  export DEV_SECRETS_PATH="$KEYS_DIR/dev-secrets.json"
elif [ -f "$KEYS_DIR/keymap.json" ]; then
  export KEYMAP_PATH="$KEYS_DIR/keymap.json"
  if [ -f "$KEYS_DIR/dev-secrets.json" ]; then
    export DEV_SECRETS_PATH="$KEYS_DIR/dev-secrets.json"
  fi
fi

if [ "$SERVICE" = "coordinator" ]; then
  exec node apps/coordinator/dist/server.js
else
  exec node apps/resource-server/dist/server.js
fi
