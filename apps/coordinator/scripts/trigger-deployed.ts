/**
 * Manual trigger probe against the DEPLOYED workflow (Checkpoint D-live).
 * Builds a real 3-envelope batch from dev keys, signs the gateway JWT with
 * the coordinator key, posts to the CRE gateway, prints whatever comes back.
 *
 * Env:
 *   COORDINATOR_SIGNING_KEY  0x ECDSA key matching workflow authorizedKeys
 *                            (defaults to HEDERA_PRIVATE_KEY — same account)
 *   CRE_GATEWAY_URL          default https://01.gateway.zone-a.cre.chain.link/
 *   CRE_WORKFLOW_ID          default = Bombus staging deployment
 *   KEYMAP_PATH / DEV_SECRETS_PATH (dev key files)
 *
 * Run: pnpm --filter @private-signal-swarm/coordinator trigger:deployed
 */
import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  sealToEnclave,
  signEnvelope,
  type KeymapFile,
} from '@private-signal-swarm/confidential-core';
import { ENVELOPE_VERSION, USE_CASES, type EncryptedEnvelope } from '@private-signal-swarm/types';
import { DeployedWorkflowTrigger } from '../src/trigger-client.js';

const ROOT = findWorkspaceRoot(fileURLToPath(import.meta.url));

function loadDotEnvFile(filePath: string): void {
  if (!fs.existsSync(filePath)) {
    return;
  }
  const content = fs.readFileSync(filePath, 'utf-8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) {
      continue;
    }
    const idx = trimmed.indexOf('=');
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

loadDotEnvFile(path.join(ROOT, '.env'));
loadDotEnvFile(path.join(ROOT, 'cre', '.env'));

function findWorkspaceRoot(start: string): string {
  let dir = path.dirname(start);
  for (;;) {
    if (fs.existsSync(path.join(dir, 'pnpm-workspace.yaml'))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      throw new Error('workspace root (pnpm-workspace.yaml) not found');
    }
    dir = parent;
  }
}
const WORKFLOW_ID =
  process.env.CRE_WORKFLOW_ID || '007a91ee992fc7e62fedebd0e86c4b64978886d09fed0cc001f615727a33132c';
const GATEWAY = process.env.CRE_GATEWAY_URL || 'https://01.gateway.zone-a.cre.chain.link/';

async function main(): Promise<void> {
  const signingKey =
    process.env.COORDINATOR_SIGNING_KEY ||
    process.env.TRIGGER_PRIVATE_KEY ||
    process.env.HEDERA_PRIVATE_KEY;
  if (!signingKey) {
    throw new Error(
      'Set COORDINATOR_SIGNING_KEY, TRIGGER_PRIVATE_KEY (cre/.env), or HEDERA_PRIVATE_KEY — must match workflow authorizedKeys'
    );
  }

  const keymapPath =
    process.env.KEYMAP_PATH || path.join(ROOT, 'packages/confidential-core/.dev-keys/keymap.json');
  const secretsPath =
    process.env.DEV_SECRETS_PATH ||
    path.join(ROOT, 'packages/confidential-core/.dev-keys/dev-secrets.json');
  if (!fs.existsSync(keymapPath) || !fs.existsSync(secretsPath)) {
    throw new Error(
      `Missing dev keys at ${path.dirname(keymapPath)}. Run: pnpm --filter @private-signal-swarm/confidential-core keygen`
    );
  }
  const keymap = JSON.parse(fs.readFileSync(keymapPath, 'utf-8')) as KeymapFile;
  if (process.env.CRE_TEE_ENC_PUB && process.env.CRE_TEE_ENC_PUB !== keymap.tee.encPub) {
    keymap.tee.encPub = process.env.CRE_TEE_ENC_PUB;
    console.log('Sealing envelopes to Vault TEE pubkey from cre/.env');
  }
  const secrets = JSON.parse(fs.readFileSync(secretsPath, 'utf-8')) as {
    agents: Record<string, { signPriv: string }>;
  };

  const trigger = new DeployedWorkflowTrigger({
    gatewayUrl: GATEWAY,
    workflowId: WORKFLOW_ID,
    signingKey,
  });
  console.log(`Trigger signer: ${trigger.address}`);
  console.log(`Gateway: ${GATEWAY}`);
  console.log(`Workflow: ${WORKFLOW_ID}`);

  const roundId = `trigger-probe-${Date.now().toString(36)}`;
  const ballots = [
    { agentId: 'agent-1', vote: 'support', confidence: 0.9 },
    { agentId: 'agent-2', vote: 'support', confidence: 0.8 },
    { agentId: 'agent-3', vote: 'oppose', confidence: 0.3 },
  ];

  const envelopes: EncryptedEnvelope[] = [];
  for (const b of ballots) {
    const { agentId, ...vote } = b;
    const plaintext = JSON.stringify({ proposalRef: 'proposal-trigger-probe', ...vote });
    const ciphertext = await sealToEnclave(plaintext, keymap.tee.encPub);
    const base = {
      version: ENVELOPE_VERSION,
      useCase: USE_CASES.deliberation,
      keyId: keymap.keyId,
      agentId,
      roundId,
      nonce: randomUUID(),
      ciphertext,
      timestamp: Date.now(),
    };
    const signature = await signEnvelope(secrets.agents[agentId].signPriv, base);
    envelopes.push({ ...base, signature });
  }
  console.log(`Batch built: ${envelopes.length} envelopes, round ${roundId}`);

  const started = Date.now();
  const result = await trigger.execute({
    roundId,
    useCase: USE_CASES.deliberation,
    keyId: keymap.keyId,
    envelopes,
  });
  console.log(`Roundtrip: ${Date.now() - started}ms`);
  console.log(`Accepted: ${result.accepted} | execution: ${result.executionId ?? '(none)'}`);
  console.log(JSON.stringify(result.body, null, 2).slice(0, 2000));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
