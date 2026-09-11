#!/bin/bash
set -e
cd "$(dirname "$0")"

# Full circuit probe:
#   agents → coordinator (local TEE seam) → resource server
#   + Step 5 replays the LIVE round through the real CRE workflow and
#     cross-checks the outcome.
#
# Env overrides:
#   CRE_PROBE_MODE=simulate|deployed                  (default: simulate)
#     simulate: `cre workflow simulate` on the exact live envelopes
#               (needs matching local keys; full signature + verdict check)
#     deployed: rebuild the live round sealed to the DON vault key and run it
#               on the DEPLOYED workflow via the gateway (needs trigger key +
#               DON secrets; attests execution + round in DON logs)
#   SIMULATE_TARGET=plain-settings|staging-settings  (default: staging-settings)
#   CRE_PROBE_SKIP=1                                 (skip the CRE step)
#   PROPOSAL_REF                                     (default: proposal-e2e-test)
#   CRE_WORKFLOW_ID / CRE_GATEWAY_URL                (deployed mode)
#   KEYMAP_PATH / DEV_SECRETS_PATH                   (default: dev keys)

BATCH_DIR="$(mktemp -d "${TMPDIR:-/tmp}/swarm-full-flow-batches-XXXXXX")"
CRE_PROBE_MODE="${CRE_PROBE_MODE:-simulate}"
SIMULATE_TARGET="${SIMULATE_TARGET:-staging-settings}"
PROPOSAL_REF="${PROPOSAL_REF:-proposal-e2e-test}"
KEYMAP_PATH="${KEYMAP_PATH:-packages/confidential-core/.dev-keys/keymap.json}"

echo "=== Cleaning up ==="
pkill -f "coordinator" 2>/dev/null || true
pkill -f "resource-server" 2>/dev/null || true
sleep 2

echo "=== Building circuit packages ==="
# NOTE: bare `pnpm build` also builds apps/web, which is currently broken
# (missing node_modules / tsconfig issues, unrelated to this circuit), so we
# build only the services under test plus their workspace dependencies (`...`).
pnpm --filter @private-signal-swarm/coordinator... \
  --filter @private-signal-swarm/resource-server... \
  --filter @private-signal-swarm/agent... \
  --filter @private-signal-swarm/cre-workflow... \
  build

echo ""
echo "=== Step 1: Starting Coordinator (port 3001) ==="
RESULT_INGEST_URL=http://localhost:3000/api/internal/ingest \
COORDINATOR_DEBUG_DUMP_DIR="$BATCH_DIR" \
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

# Always stop background services, even if a later step fails.
trap 'kill $COORD_PID $RS_PID 2>/dev/null || true' EXIT

echo ""
echo "=== Step 3: Running 3 Agents ==="
AGENT_ID=agent-1 node apps/agent/dist/main.js "$PROPOSAL_REF" deliberation
AGENT_ID=agent-2 node apps/agent/dist/main.js "$PROPOSAL_REF" deliberation
AGENT_ID=agent-3 node apps/agent/dist/main.js "$PROPOSAL_REF" deliberation

echo ""
echo "=== Step 4: Checking Results ==="
sleep 2
echo "Coordinator:"
curl -s "http://localhost:3001/result/latest?useCase=deliberation.v1" | python3 -m json.tool
echo ""
echo "Resource Server:"
curl -s "http://localhost:3000/api/verdict?useCase=deliberation.v1" | python3 -m json.tool

echo ""
echo "=== Step 5: CRE workflow probe (mode=$CRE_PROBE_MODE) ==="
LIVE_BATCH="$(ls -t "$BATCH_DIR"/*.batch.json 2>/dev/null | head -1 || true)"
if [ -z "$LIVE_BATCH" ]; then
  echo " ✗ FAILED: no live batch dumped (quorum not reached?) in $BATCH_DIR"
  exit 1
fi
echo "Live batch: $LIVE_BATCH"
python3 -c "import json; b=json.load(open('$LIVE_BATCH')); print(f\"  roundId={b['roundId']} envelopes={len(b['envelopes'])}\")"

if [ "${CRE_PROBE_SKIP:-0}" = "1" ]; then
  echo "Skipped (CRE_PROBE_SKIP=1)"
elif [ "$CRE_PROBE_MODE" = "deployed" ]; then
  echo "Running the live round on the DEPLOYED workflow via the DON gateway..."
  if [ ! -x "$HOME/.cre/bin/cre" ]; then
    echo " ✗ FAILED: deployed mode needs the CRE CLI at \$HOME/.cre/bin/cre (for execution polling)"
    exit 1
  fi
  pnpm --filter @private-signal-swarm/coordinator build:scripts
  LIVE_BATCH_PATH="$LIVE_BATCH" PROPOSAL_REF="$PROPOSAL_REF" \
    node apps/coordinator/dist-scripts/scripts/trigger-live-round.js
elif [ ! -x "$HOME/.cre/bin/cre" ]; then
  echo "Skipped: CRE CLI not found at \$HOME/.cre/bin/cre"
else
  echo "Replaying live batch through the real workflow (target=$SIMULATE_TARGET, ~1-2 min for WASM compile)..."
  CRE_SIM_LOG="$BATCH_DIR/cre-simulate.log"
  SIMULATE_TARGET="$SIMULATE_TARGET" SIMULATE_PAYLOAD_PATH="$LIVE_BATCH" \
    pnpm --filter @private-signal-swarm/cre-workflow simulate >"$CRE_SIM_LOG" 2>&1
  echo "--- simulate tail ---"
  tail -20 "$CRE_SIM_LOG"

  CRE_RESULT_JSON="$BATCH_DIR/cre-result.json"
  python3 - "$CRE_SIM_LOG" "$CRE_RESULT_JSON" <<'EOF'
import json, sys
log_path, out_path = sys.argv[1], sys.argv[2]
text = open(log_path).read()
marker = "Workflow Simulation Result:"
i = text.find(marker)
if i == -1:
    raise SystemExit("✗ FAILED: simulate log missing result marker — workflow execution failed")
obj, _ = json.JSONDecoder().raw_decode(text, text.find("{", i))
json.dump(obj, open(out_path, "w"), indent=2)
print(f"CRE result: roundId={obj['roundId']} "
      f"verdict={obj['payload'].get('verdict')} "
      f"participants={obj['participantCount']}")
EOF

  echo "Verifying CRE result signature against the TEE public key..."
  # NOTE: node resolves the workspace package from cwd, so run from
  # packages/confidential-core (resolving keymap/result paths first).
  KEYMAP_ABS="$(python3 -c "import os,sys; print(os.path.abspath(sys.argv[1]))" "$KEYMAP_PATH")"
  CRE_RESULT_ABS="$(python3 -c "import os,sys; print(os.path.abspath(sys.argv[1]))" "$CRE_RESULT_JSON")"
  (cd packages/confidential-core && node --input-type=module -e '
import fs from "node:fs";
import { verifyTeeSignature } from "@private-signal-swarm/confidential-core";
const [keymapPath, resultPath] = process.argv.slice(1);
const keymap = JSON.parse(fs.readFileSync(keymapPath, "utf-8"));
const r = JSON.parse(fs.readFileSync(resultPath, "utf-8"));
const ok = await verifyTeeSignature(keymap.tee.signPub, {
  useCase: r.useCase,
  roundId: r.roundId,
  participantCount: r.participantCount,
  timestamp: r.timestamp,
  payload: r.payload,
}, r.teeSignature);
if (!ok) {
  console.error("✗ FAILED: CRE result signature INVALID");
  process.exit(1);
}
console.log("✓ CRE result signature valid (TEE key)");
' "$KEYMAP_ABS" "$CRE_RESULT_ABS")

  echo "Cross-checking CRE verdict/round against the coordinator result..."
  python3 - "$CRE_RESULT_JSON" <<'EOF'
import json, sys, urllib.request
cre = json.load(open(sys.argv[1]))
coord = json.load(urllib.request.urlopen(
    "http://localhost:3001/result/latest?useCase=deliberation.v1"))
assert cre["roundId"] == coord["roundId"], \
    f"round mismatch: CRE={cre['roundId']} coordinator={coord['roundId']}"
assert cre["payload"].get("verdict") == coord["payload"].get("verdict"), \
    f"verdict mismatch: CRE={cre['payload'].get('verdict')} coordinator={coord['payload'].get('verdict')}"
assert cre["participantCount"] == coord["participantCount"], \
    "participant count mismatch"
print(f"✓ CRE and coordinator agree: round {cre['roundId']} → "
      f"verdict={cre['payload'].get('verdict')} "
      f"(participants={cre['participantCount']})")
EOF
fi

echo ""
echo "=== Stopping services ==="
kill $COORD_PID $RS_PID 2>/dev/null || true
trap - EXIT
echo "Done! (live batches + CRE logs kept in $BATCH_DIR)"
