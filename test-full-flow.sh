#!/bin/bash
set -e

echo "=== Cleaning up ==="
pkill -f "coordinator" 2>/dev/null || true
pkill -f "resource-server" 2>/dev/null || true
sleep 2

echo "=== Building all packages ==="
pnpm build

echo ""
echo "=== Step 1: Starting Coordinator (port 3001) ==="
cd /home/ldisanza/proyectos/Confidential-Agent-Swarm-Aggregation
RESULT_INGEST_URL=http://localhost:3000/api/internal/ingest \
  node apps/coordinator/dist/server.js &
COORD_PID=$!
sleep 2
curl -s http://localhost:3001/health && echo " ✓ OK" || echo " ✗ FAILED"

echo ""
echo "=== Step 2: Starting Resource Server (port 3000) ==="
node apps/resource-server/dist/server.js &
RS_PID=$!
sleep 2
curl -s http://localhost:3000/api/status && echo " ✓ OK" || echo " ✗ FAILED"

echo ""
echo "=== Step 3: Running 3 Agents ==="
AGENT_ID=agent-1 node apps/agent/dist/main.js proposal-e2e-test deliberation
AGENT_ID=agent-2 node apps/agent/dist/main.js proposal-e2e-test deliberation
AGENT_ID=agent-3 node apps/agent/dist/main.js proposal-e2e-test deliberation

echo ""
echo "=== Step 4: Checking Results ==="
sleep 2
echo "Coordinator:"
curl -s "http://localhost:3001/result/latest?useCase=deliberation.v1" | python3 -m json.tool
echo ""
echo "Resource Server:"
curl -s "http://localhost:3000/api/verdict?useCase=deliberation.v1" | python3 -m json.tool

echo ""
echo "=== Stopping services ==="
kill $COORD_PID $RS_PID 2>/dev/null || true
echo "Done!"
