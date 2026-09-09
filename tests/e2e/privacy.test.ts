import { describe, it, expect, beforeAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { ENVELOPE_VERSION, USE_CASES } from '@private-signal-swarm/types';
import {
  generateKeyMaterial,
  sealToEnclave,
  signEnvelope,
  tallyBallots,
  type KeyMaterial,
} from '@private-signal-swarm/confidential-core';

let material: KeyMaterial;

beforeAll(async () => {
  material = await generateKeyMaterial(['agent-1']);
});

describe('Privacy properties of the envelope substrate', () => {
  it('sealed boxes are randomized (IND-CPA sanity): same plaintext → distinct ciphertexts', async () => {
    const plaintext = JSON.stringify({ proposalRef: 'p', vote: 'support', confidence: 0.9 });
    const c1 = await sealToEnclave(plaintext, material.teeEnc.publicKey);
    const c2 = await sealToEnclave(plaintext, material.teeEnc.publicKey);
    expect(c1).not.toBe(c2);
  });

  it('distinct payloads → distinct ciphertexts', async () => {
    const c1 = await sealToEnclave(JSON.stringify({ v: 1 }), material.teeEnc.publicKey);
    const c2 = await sealToEnclave(JSON.stringify({ v: 2 }), material.teeEnc.publicKey);
    expect(c1).not.toBe(c2);
  });

  it('every N=3 cohort suppresses the tally: output reveals verdict + count only', () => {
    const votes = [
      { vote: 'support' as const, confidence: 1.0 },
      { vote: 'oppose' as const, confidence: 0.9 },
      { vote: 'abstain' as const, confidence: 0.1 },
    ];
    for (let i = 0; i < 10; i++) {
      const ballots = votes.map((v, j) => ({
        proposalRef: `prop-${i}`,
        vote: j === i % 3 ? 'support' : v.vote,
        confidence: Math.min(1, v.confidence + i * 0.01),
      }));
      const result = tallyBallots(ballots);
      expect(Object.keys(result)).toEqual(
        expect.arrayContaining(['proposalRef', 'verdict', 'participantCount'])
      );
      expect('tally' in result && result.tally !== undefined).toBe(false);
      const serialized = JSON.stringify(result);
      expect(serialized).not.toContain('"vote"');
      expect(serialized).not.toContain('"confidence"');
    }
  });

  it('signature binds envelope fields: reusing a signature on altered metadata fails', async () => {
    const agent = material.agents[0];
    const ciphertext = await sealToEnclave(JSON.stringify({ x: 1 }), material.teeEnc.publicKey);
    const base = {
      version: ENVELOPE_VERSION,
      useCase: USE_CASES.deliberation,
      keyId: material.keyId,
      agentId: agent.agentId,
      roundId: 'round-a',
      nonce: randomUUID(),
      ciphertext,
      timestamp: Date.now(),
    };
    const signature = await signEnvelope(agent.sign.privateKey, base);
    const { verifyEnvelope } = await import('@private-signal-swarm/confidential-core');

    expect(await verifyEnvelope(agent.sign.publicKey, base, signature)).toBe(true);
    // signature from round-a does not validate for round-b
    expect(
      await verifyEnvelope(agent.sign.publicKey, { ...base, roundId: 'round-b' }, signature)
    ).toBe(false);
    // nor for a different use case
    expect(
      await verifyEnvelope(agent.sign.publicKey, { ...base, useCase: USE_CASES.signalEstimate }, signature)
    ).toBe(false);
  });
});
