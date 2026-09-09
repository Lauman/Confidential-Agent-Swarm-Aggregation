import { describe, it, expect, beforeAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { ENVELOPE_VERSION, USE_CASES, type TeeSignedResult } from '@private-signal-swarm/types';
import {
  generateKeyMaterial,
  processBatch,
  sealToEnclave,
  signEnvelope,
  type KeyMaterial,
  type KeymapFile,
} from '@private-signal-swarm/confidential-core';
import { VerifiedResultStore } from '../../apps/resource-server/src/result-store.js';

let material: KeyMaterial;
let keymap: KeymapFile;

beforeAll(async () => {
  material = await generateKeyMaterial(['agent-1', 'agent-2', 'agent-3']);
  const { toKeymap } = await import('@private-signal-swarm/confidential-core');
  keymap = toKeymap(material);
});

async function realSignedResult(roundId: string): Promise<TeeSignedResult> {
  const envelopes = [];
  const votes = [
    { vote: 'support' as const, confidence: 0.9 },
    { vote: 'support' as const, confidence: 0.8 },
    { vote: 'oppose' as const, confidence: 0.3 },
  ];
  for (let i = 0; i < 3; i++) {
    const agent = material.agents[i];
    const ciphertext = await sealToEnclave(
      JSON.stringify({ proposalRef: 'prop-1', ...votes[i] }),
      material.teeEnc.publicKey
    );
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
    envelopes.push({ ...base, signature: await signEnvelope(agent.sign.privateKey, base) });
  }
  return processBatch(
    { roundId, useCase: USE_CASES.deliberation, keyId: material.keyId, envelopes },
    {
      teeEncPub: material.teeEnc.publicKey,
      teeEncPriv: material.teeEnc.privateKey,
      teeSignPriv: material.teeSign.privateKey,
    }
  );
}

describe('VerifiedResultStore (verify-at-intake)', () => {
  it('stores a genuinely TEE-signed result', async () => {
    const store = new VerifiedResultStore(keymap);
    const result = await realSignedResult('round-1');
    const stored = await store.ingest(result);
    expect(stored.roundId).toBe('round-1');

    const latest = store.getLatest(USE_CASES.deliberation);
    expect(latest?.roundId).toBe('round-1');
    expect(store.status()).toHaveLength(1);
    expect(store.status()[0].participantCount).toBe(3);
  });

  it('rejects a result signed by the wrong key (fabricated result)', async () => {
    const store = new VerifiedResultStore(keymap);
    const result = await realSignedResult('round-fake');
    // re-sign the SAME payload with an agent key instead of the TEE key
    const { teeSignResult } = await import('@private-signal-swarm/confidential-core');
    const forged = {
      ...result,
      teeSignature: await teeSignResult(material.agents[0].sign.privateKey, {
        useCase: result.useCase,
        roundId: result.roundId,
        participantCount: result.participantCount,
        timestamp: result.timestamp,
        payload: result.payload,
      }),
    };
    await expect(store.ingest(forged)).rejects.toMatchObject({ code: 'unverified' });
    expect(store.getLatest(USE_CASES.deliberation)).toBeUndefined();
  });

  it('rejects a tampered payload (signature no longer matches)', async () => {
    const store = new VerifiedResultStore(keymap);
    const result = await realSignedResult('round-tamper');
    const tampered = {
      ...result,
      payload: { ...(result.payload as object), verdict: 'fail' },
    };
    await expect(store.ingest(tampered)).rejects.toMatchObject({ code: 'unverified' });
  });

  it('rejects malformed intake bodies', async () => {
    const store = new VerifiedResultStore(keymap);
    await expect(store.ingest({ nope: true })).rejects.toMatchObject({ code: 'malformed' });
  });

  it('keeps the latest result per use case (max timestamp)', async () => {
    const store = new VerifiedResultStore(keymap);
    await store.ingest(await realSignedResult('round-old'));
    const newer = await realSignedResult('round-new');
    await store.ingest(newer);
    expect(store.getLatest(USE_CASES.deliberation)?.roundId).toBe('round-new');
  });
});
