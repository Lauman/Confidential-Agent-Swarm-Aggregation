#!/bin/bash
# Web demo: serves the Bombus UI wired to the live local flow.
#   coordinator (:3001) + resource server (:3000, dev mode, no x402) + vite (:5173)
# The UI talks to both backends through vite's proxy (see apps/web/vite.config.ts).
# Open http://localhost:5173 and press Deliberate — nothing here is mocked.
#
# Stop with Ctrl-C (all three services are stopped automatically).
set -e
cd "$(dirname "$0")"

require_free_port() {
  if ss -ltn 2>/dev/null | grep -qE ":$1( |$)"; then
    echo " ✗ Port $1 is already in use — stop whatever holds it first (ss -ltnp | grep $1)."
    exit 1
  fi
}
require_free_port 3000
require_free_port 3001
require_free_port 5173

echo "=== Building circuit packages ==="
pnpm --filter @private-signal-swarm/coordinator... \
  --filter @private-signal-swarm/resource-server... \
  --filter @private-signal-swarm/agent... \
  build

echo ""
echo "=== Starting Coordinator (:3001) ==="
RESULT_INGEST_URL=http://localhost:3000/api/internal/ingest \
  node apps/coordinator/dist/server.js &
COORD_PID=$!

echo "=== Starting Resource Server (:3000, dev mode) ==="
# Forced free mode: the UI fetches with plain fetch (no wallet), so any
# X402_PAY_TO leaked from the shell would 402 every verdict request.
# (Paid access is proven separately via pay:verdict + the receipt panel.)
env -u X402_PAY_TO -u X402_FACILITATOR_URL \
  node apps/resource-server/dist/server.js &
RS_PID=$!

echo "=== Starting Web UI (:5173) ==="
pnpm --filter @private-signal-swarm/web dev &
WEB_PID=$!

trap 'kill $COORD_PID $RS_PID $WEB_PID 2>/dev/null || true' EXIT INT TERM

sleep 6
echo ""
curl -s http://localhost:3001/health >/dev/null && echo "Coordinator:      ✓ http://localhost:3001/health" || echo "Coordinator:      ✗ NOT UP"
curl -s http://localhost:3000/api/status >/dev/null && echo "Resource server:  ✓ http://localhost:3000/api/status" || echo "Resource server:  ✗ NOT UP"
curl -s http://localhost:5173/ >/dev/null && echo "Web UI:           ✓ http://localhost:5173" || echo "Web UI:           ✗ NOT UP"
if [ -n "${CRE_GATEWAY_URL:-}" ] && [ -n "${CRE_WORKFLOW_ID:-}" ] && [ -n "${DON_TEE_ENC_PUB:-${CRE_TEE_ENC_PUB:-}}" ]; then
  echo "CRE trigger:      ✓ ARMED (Deliberate also fires the deployed DON workflow)"
else
  echo "CRE trigger:      off (set CRE_GATEWAY_URL, CRE_WORKFLOW_ID, COORDINATOR_SIGNING_KEY, DON_TEE_ENC_PUB to also run each round on the DON)"
fi
echo ""
echo "Open http://localhost:5173 and press Deliberate. Ctrl-C to stop everything."
wait
