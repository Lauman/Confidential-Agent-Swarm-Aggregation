import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { ENVELOPE_VERSION, USE_CASES, type EncryptedEnvelope } from '@private-signal-swarm/types';
import {
  generateKeyMaterial,
  sealToEnclave,
  signEnvelope,
  toDevSecrets,
  toKeymap,
  type KeyMaterial,
} from '@private-signal-swarm/confidential-core';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const KEYS_DIR = path.join(ROOT, 'packages/confidential-core/.dev-keys');
const PAYLOAD_PATH = path.join(ROOT, 'cre/workflows/aggregate/test-payload.json');

const BALLOTS = [
  { agentId: 'agent-1', vote: 'support' as const, confidence: 0.9 },
  { agentId: 'agent-2', vote: 'support' as const, confidence: 0.8 },
  { agentId: 'agent-3', vote: 'oppose' as const, confidence: 0.3 },
];

async function loadMaterial(): Promise<KeyMaterial> {
  const keymapPath = path.join(KEYS_DIR, 'keymap.json');
  if (!fs.existsSync(keymapPath)) {
    throw new Error('Dev keys not found. Run `pnpm --filter @private-signal-swarm/confidential-core keygen` first.');
  }
  const keymap = JSON.parse(fs.readFileSync(keymapPath, 'utf-8')) as ReturnType<typeof toKeymap>;
  const secrets = JSON.parse(
    fs.readFileSync(path.join(KEYS_DIR, 'dev-secrets.json'), 'utf-8')
  ) as ReturnType<typeof toDevSecrets>;

  const material = await generateKeyMaterial(Object.keys(keymap.agents), keymap.keyId);
  // adopt the existing persisted keys instead of the fresh ones
  material.teeEnc = {
    publicKey: keymap.tee.encPub,
    privateKey: secrets.tee.encPriv,
  };
  material.teeSign = {
    publicKey: keymap.tee.signPub,
    privateKey: secrets.tee.signPriv,
  };
  material.agents = Object.keys(keymap.agents).map((agentId) => ({
    agentId,
    sign: {
      publicKey: keymap.agents[agentId].signPub,
      privateKey: secrets.agents[agentId].signPriv,
    },
  }));
  return material;
}

export async function generateSimulatePayload(): Promise<void> {
  const material = await loadMaterial();
  const roundId = `simulate-${Date.now().toString(36)}`;

  const envelopes: EncryptedEnvelope[] = [];
  for (const ballot of BALLOTS) {
    const agent = material.agents.find((a) => a.agentId === ballot.agentId);
    if (!agent) throw new Error(`No key material for ${ballot.agentId}`);
    const plaintext = JSON.stringify({
      proposalRef: 'proposal-simulate-001',
      vote: ballot.vote,
      confidence: ballot.confidence,
    });
    const ciphertext = await sealToEnclave(plaintext, material.teeEnc.publicKey);
    const base = {
      version: ENVELOPE_VERSION,
      useCase: USE_CASES.deliberation,
      keyId: material.keyId,
      agentId: ballot.agentId,
      roundId,
      nonce: randomUUID(),
      ciphertext,
      timestamp: Date.now(),
    };
    const signature = await signEnvelope(agent.sign.privateKey, base);
    envelopes.push({ ...base, signature });
  }

  const payload = { roundId, useCase: USE_CASES.deliberation, keyId: material.keyId, envelopes };
  fs.writeFileSync(PAYLOAD_PATH, JSON.stringify(payload, null, 2));
  console.log(`Simulate payload written: ${PAYLOAD_PATH}`);
  console.log(`  round: ${roundId}, envelopes: ${envelopes.length} (encrypted to ${material.keyId})`);
}

if (process.argv[1] && process.argv[1].endsWith('generate-simulate-payload.ts')) {
  generateSimulatePayload().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
