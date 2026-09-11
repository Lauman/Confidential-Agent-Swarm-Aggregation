import { describe, it, expect, beforeAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  ENVELOPE_VERSION,
  USE_CASES,
  type EncryptedEnvelope,
} from '@private-signal-swarm/types';
import {
  generateKeyMaterial,
  sealToEnclave,
  signEnvelope,
  toDevSecrets,
  toKeymap,
  type KeyMaterial,
} from '@private-signal-swarm/confidential-core';
import { RoundManager } from '../../apps/coordinator/src/round-manager.js';
import { TombstoneStore, computeBatchHash, computeEnvelopeHash } from '../../apps/coordinator/src/tombstone-store.js';
import { LocalTeeRunner } from '../../apps/coordinator/src/tee-seam.js';
import { EnvelopeValidationError } from '../../apps/coordinator/src/envelope-validator.js';

interface Ctx {
  material: KeyMaterial;
  stateDir: string;
}

let ctx: Ctx;

beforeAll(async () => {
  const material = await generateKeyMaterial(['agent-1', 'agent-2', 'agent-3', 'agent-4']);
  ctx = {
    material,
    stateDir: fs.mkdtempSync(path.join(os.tmpdir(), 'swarm-test-')),
  };
});

function makeStore(): TombstoneStore {
  return new TombstoneStore(fs.mkdtempSync(path.join(os.tmpdir(), 'swarm-store-')));
}

function makeManager(store: TombstoneStore): RoundManager {
  const keymap = toKeymap(ctx.material);
  const secrets = toDevSecrets(ctx.material);
  return new RoundManager({
    quorum: 3,
    teeSeam: {
      process: async (batch) =>
        new LocalTeeRunnerInMemory(secrets).process(batch, keymap.keyId),
    },
    store,
    keyId: keymap.keyId,
  });
}

class LocalTeeRunnerInMemory extends LocalTeeRunner {
  constructor(secrets: ReturnType<typeof toDevSecrets>) {
    super(writeSecrets(secrets));
  }
}

function writeSecrets(secrets: ReturnType<typeof toDevSecrets>): string {
  const p = path.join(ctx.stateDir, 'dev-secrets.json');
  fs.writeFileSync(p, JSON.stringify(secrets));
  return p;
}

async function makeEnvelope(
  agentIndex: number,
  roundId: string,
  ballot: { proposalRef: string; vote: 'support' | 'oppose' | 'abstain'; confidence: number }
): Promise<EncryptedEnvelope> {
  const material = ctx.material;
  const agent = material.agents[agentIndex];
  const plaintext = JSON.stringify(ballot);
  const ciphertext = await sealToEnclave(plaintext, material.teeEnc.publicKey);
  const base = {
    version: ENVELOPE_VERSION,
    useCase: USE_CASES.deliberation,
    keyId: material.keyId,
    agentId: agent.agentId,
    roundId,
    nonce: randomUUID(),
    ciphertext,
    timestamp: Date.now(),
  };
  const signature = await signEnvelope(agent.sign.privateKey, base);
  return { ...base, signature };
}

describe('RoundManager blind quorum', () => {
  it('collects encrypted envelopes until quorum, then aggregates via the TEE seam', async () => {
    const store = makeStore();
    const manager = makeManager(store);
    const roundId = manager.getCurrentRoundId(USE_CASES.deliberation);

    const e1 = await makeEnvelope(0, roundId, { proposalRef: 'prop-1', vote: 'support', confidence: 0.9 });
    const e2 = await makeEnvelope(1, roundId, { proposalRef: 'prop-1', vote: 'support', confidence: 0.8 });
    const e3 = await makeEnvelope(2, roundId, { proposalRef: 'prop-1', vote: 'oppose', confidence: 0.3 });

    expect((await manager.handleSubmit(e1)).status).toBe('accepted');
    expect((await manager.handleSubmit(e2)).status).toBe('accepted');

    const outcome = await manager.handleSubmit(e3);
    if (outcome.status !== 'quorum-reached') {
      throw new Error(`Expected quorum-reached, got ${outcome.status}`);
    }

    const payload = outcome.result.payload as {
      roundId: string;
      verdict: string;
      participantCount: number;
    };
    expect(payload.roundId).toBe(roundId);
    expect(payload.participantCount).toBe(3);
    // W_s = 1.7, W_o = 0.3, total = 2.0 → net = 0.7 ≥ 0.5 → pass
    expect(payload.verdict).toBe('pass');
    expect(outcome.result.teeSignature).toBeTruthy();
    // small-N suppression: no tally in the output
    expect('tally' in payload && payload.tally !== undefined).toBe(false);
  });

  it('rejects a second submission from the same agent', async () => {
    const store = makeStore();
    const manager = makeManager(store);
    const roundId = manager.getCurrentRoundId(USE_CASES.deliberation);

    const e1 = await makeEnvelope(0, roundId, { proposalRef: 'prop-1', vote: 'support', confidence: 0.9 });
    await manager.handleSubmit(e1);

    const e1b = await makeEnvelope(0, roundId, { proposalRef: 'prop-1', vote: 'oppose', confidence: 1.0 });
    await expect(manager.handleSubmit(e1b)).rejects.toMatchObject({ code: 'already-submitted' });
  });

  it('rejects nonce replay from a different agent', async () => {
    const store = makeStore();
    const manager = makeManager(store);
    const roundId = manager.getCurrentRoundId(USE_CASES.deliberation);

    const e1 = await makeEnvelope(0, roundId, { proposalRef: 'prop-1', vote: 'support', confidence: 0.9 });
    await manager.handleSubmit(e1);

    const stolen: EncryptedEnvelope = { ...e1, agentId: ctx.material.agents[1].agentId };
    await expect(manager.handleSubmit(stolen)).rejects.toMatchObject({ code: 'duplicate-nonce' });
  });

  it('closes the round (tombstone) and rejects further submissions even after restart', async () => {
    const store = makeStore();
    const manager = makeManager(store);
    const roundId = manager.getCurrentRoundId(USE_CASES.deliberation);

    for (let i = 0; i < 3; i++) {
      await manager.handleSubmit(
        await makeEnvelope(i, roundId, { proposalRef: 'prop-1', vote: 'abstain', confidence: 0.5 })
      );
    }

    const e4 = await makeEnvelope(3, roundId, { proposalRef: 'prop-1', vote: 'support', confidence: 0.9 });
    await expect(manager.handleSubmit(e4)).rejects.toMatchObject({ code: 'round-closed' });

    // restart: fresh manager over the same persisted state
    const manager2 = makeManager(makeStore());
    await expect(manager2.handleSubmit(e4)).rejects.toMatchObject({ code: 'round-closed' });
  });

  it('serves the latest result per use case (max timestamp)', async () => {
    const store = makeStore();
    const manager = makeManager(store);

    expect(manager.getLatestResult(USE_CASES.deliberation)).toBeUndefined();

    const r1 = manager.getCurrentRoundId(USE_CASES.deliberation);
    for (let i = 0; i < 3; i++) {
      await manager.handleSubmit(await makeEnvelope(i, r1, { proposalRef: 'p-a', vote: 'support', confidence: 1.0 }));
    }
    const r2 = manager.getCurrentRoundId(USE_CASES.deliberation);
    for (let i = 0; i < 3; i++) {
      await manager.handleSubmit(await makeEnvelope(i, r2, { proposalRef: 'p-b', vote: 'oppose', confidence: 1.0 }));
    }

    const latest = manager.getLatestResult(USE_CASES.deliberation);
    expect(latest).toBeDefined();
    expect((latest!.payload as { proposalRef: string }).proposalRef).toBe('p-b');
  });
});

describe('TombstoneStore + batch hash', () => {
  it('batch hash is order-stable and content-sensitive', () => {
    const keyId = 'enclave-1';
    const envs = [
      { agentId: 'a', nonce: 'n1', ciphertext: 'c1' },
      { agentId: 'b', nonce: 'n2', ciphertext: 'c2' },
    ];
    const h1 = computeBatchHash({ keyId }, envs);
    const h2 = computeBatchHash({ keyId }, envs);
    const h3 = computeBatchHash({ keyId }, [...envs].reverse());
    expect(h1).toBe(h2);
    expect(h1).not.toBe(h3);
  });
});

describe('EnvelopeValidationError codes', () => {
  it('carries machine-readable codes', () => {
    const err = new EnvelopeValidationError('round-closed', 'nope');
    expect(err.code).toBe('round-closed');
    expect(err.name).toBe('EnvelopeValidationError');
  });
});

describe('submittedAgents (UI swarm feed)', () => {
  it('exposes quorum, empty list, and growing metadata on the current round', async () => {
    const manager = makeManager(makeStore());
    const record = manager.getCurrentRound(USE_CASES.deliberation);

    expect(record.quorum).toBe(3);
    expect(record.status).toBe('collecting');
    expect(record.submissionCount).toBe(0);
    expect(record.submittedAgents).toEqual([]);

    const e1 = await makeEnvelope(0, record.roundId, { proposalRef: 'p', vote: 'support', confidence: 0.9 });
    await manager.handleSubmit(e1);

    const updated = manager.getRoundRecord(record.roundId)!;
    expect(updated.submissionCount).toBe(1);
    expect(updated.submittedAgents).toHaveLength(1);
    expect(updated.submittedAgents[0].agentId).toBe('agent-1');
    expect(updated.submittedAgents[0].envelopeHash).toBe(computeEnvelopeHash(e1.ciphertext));
    expect(typeof updated.submittedAgents[0].submittedAt).toBe('number');
    // metadata only: no ciphertext, no plaintext anywhere in the record
    expect(JSON.stringify(updated)).not.toContain(e1.ciphertext.slice(0, 16));
  });

  it('retains the ordered list on the closed record and across restarts', async () => {
    const sharedDir = fs.mkdtempSync(path.join(os.tmpdir(), 'swarm-persist-'));
    const manager = makeManager(new TombstoneStore(sharedDir));
    const roundId = manager.getCurrentRoundId(USE_CASES.deliberation);

    const envs = [];
    for (let i = 0; i < 3; i++) {
      const e = await makeEnvelope(i, roundId, { proposalRef: 'p', vote: 'support', confidence: 0.5 });
      envs.push(e);
      await manager.handleSubmit(e);
    }

    const closed = manager.getRoundRecord(roundId)!;
    expect(closed.status).toBe('aggregated');
    expect(closed.submittedAgents.map((a) => a.agentId)).toEqual(['agent-1', 'agent-2', 'agent-3']);
    expect(closed.submittedAgents.map((a) => a.envelopeHash)).toEqual(
      envs.map((e) => computeEnvelopeHash(e.ciphertext))
    );

    // true restart: new store + manager over the SAME persisted dir
    const manager2 = makeManager(new TombstoneStore(sharedDir));
    const reopened = manager2.getRoundRecord(roundId)!;
    expect(reopened.status).toBe('aggregated');
    expect(reopened.submittedAgents.map((a) => a.agentId)).toEqual(['agent-1', 'agent-2', 'agent-3']);
  });
});
