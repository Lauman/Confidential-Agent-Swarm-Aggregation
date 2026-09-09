import { describe, it, expect, beforeAll } from 'vitest';
import { USE_CASES, type EncryptedEnvelope } from '@private-signal-swarm/types';
import {
  generateKeyMaterial,
  toDevSecrets,
  toKeymap,
  type KeyMaterial,
} from '@private-signal-swarm/confidential-core';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { Agent } from '../../apps/agent/src/agent.js';
import { loadConfig } from '../../apps/agent/src/config.js';
import { CoordinatorClient } from '../../apps/agent/src/coordinator-client.js';
import { deliberateMock } from '../../apps/agent/src/payload/deliberation.js';
import { RoundManager } from '../../apps/coordinator/src/round-manager.js';
import { TombstoneStore } from '../../apps/coordinator/src/tombstone-store.js';

let material: KeyMaterial;
let keysDir: string;

beforeAll(async () => {
  material = await generateKeyMaterial(['agent-1', 'agent-2', 'agent-3']);
  keysDir = fs.mkdtempSync(path.join(os.tmpdir(), 'swarm-agent-test-'));
  fs.writeFileSync(path.join(keysDir, 'keymap.json'), JSON.stringify(toKeymap(material)));
  fs.writeFileSync(path.join(keysDir, 'dev-secrets.json'), JSON.stringify(toDevSecrets(material)));
});

function agentConfig(id: string): ReturnType<typeof loadConfig> {
  return {
    id,
    coordinatorEndpoint: 'http://localhost:9',
    keySource: 'keymap' as const,
    keymapPath: path.join(keysDir, 'keymap.json'),
  };
}

describe('Agent', () => {
  it('produces envelopes that pass the coordinator validator', async () => {
    const { EnvelopeFactory } = await import('../../apps/agent/src/crypto.js');
    const priv = JSON.parse(
      fs.readFileSync(path.join(keysDir, 'dev-secrets.json'), 'utf-8')
    ) as { agents: Record<string, { signPriv: string }> };
    const envelopes = new EnvelopeFactory(path.join(keysDir, 'keymap.json'), 'agent-1', priv.agents['agent-1'].signPriv);
    const ballot = deliberateMock('agent-1', 'proposal-demo-001');
    const envelope: EncryptedEnvelope = await envelopes.createEnvelope('round-t', USE_CASES.deliberation, ballot);

    const { EnvelopeValidator } = await import('../../apps/coordinator/src/envelope-validator.js');
    const validator = new EnvelopeValidator({
      keymap: toKeymap(material),
      allowedUseCases: [USE_CASES.deliberation],
    });
    const validated = await validator.validate(envelope);
    expect(validated.agentId).toBe('agent-1');
    expect(validated.useCase).toBe(USE_CASES.deliberation);
  });

  it('mock deliberation is deterministic per (agent, proposal)', () => {
    const b1 = deliberateMock('agent-1', 'prop-a');
    const b2 = deliberateMock('agent-1', 'prop-a');
    const b3 = deliberateMock('agent-2', 'prop-a');
    expect(b1).toEqual(b2);
    expect(b1.confidence).toBeGreaterThanOrEqual(0.5);
    expect(b1.confidence).toBeLessThanOrEqual(1);
    expect(['support', 'oppose', 'abstain']).toContain(b1.vote);
    expect(b1.proposalRef).toBe('prop-a');
    expect(typeof b3.vote).toBe('string');
  });

  it('three agents reach quorum through a real coordinator round manager', async () => {
    const store = new TombstoneStore(fs.mkdtempSync(path.join(os.tmpdir(), 'swarm-store-')));
    const keymap = toKeymap(material);
    const secretsPath = path.join(keysDir, 'dev-secrets.json');

    const { LocalTeeRunner } = await import('../../apps/coordinator/src/tee-seam.js');
    const manager = new RoundManager({
      quorum: 3,
      teeSeam: new LocalTeeRunner(secretsPath),
      store,
      keyId: keymap.keyId,
    });

    const roundId = manager.getCurrentRoundId(USE_CASES.deliberation);

    const { EnvelopeFactory } = await import('../../apps/agent/src/crypto.js');
    const secrets = JSON.parse(fs.readFileSync(secretsPath, 'utf-8')) as {
      agents: Record<string, { signPriv: string }>;
    };

    let quorumResult: unknown = null;
    for (const id of ['agent-1', 'agent-2', 'agent-3']) {
      const envelopes = new EnvelopeFactory(path.join(keysDir, 'keymap.json'), id, secrets.agents[id].signPriv);
      const ballot = deliberateMock(id, 'proposal-e2e');
      const envelope = await envelopes.createEnvelope(roundId, USE_CASES.deliberation, ballot);
      const outcome = await manager.handleSubmit(envelope);
      if (outcome.status === 'quorum-reached') {
        quorumResult = outcome.result;
      }
    }

    expect(quorumResult).not.toBeNull();
    const result = quorumResult as { payload: { participantCount: number; verdict: string }; teeSignature: string };
    expect(result.payload.participantCount).toBe(3);
    expect(result.teeSignature).toBeTruthy();
  });
});

describe('CoordinatorClient error taxonomy', () => {
  it('maps coordinator error bodies to typed errors', async () => {
    const client = new CoordinatorClient('http://localhost:9/unreachable');
    await expect(client.getCurrentRoundId(USE_CASES.deliberation)).rejects.toMatchObject({
      code: 'network',
    });
  });
});
