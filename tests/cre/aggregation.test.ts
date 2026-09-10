import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { ENVELOPE_VERSION, USE_CASES, type DeliberationBallot, type TeeSignedResult } from '@private-signal-swarm/types';
import {
  generateKeyMaterial,
  processBatch,
  sealToEnclave,
  signEnvelope,
  tallyBallots,
  verifyTeeSignature,
  type KeyMaterial,
} from '@private-signal-swarm/confidential-core';

function ballot(vote: DeliberationBallot['vote'], confidence: number): DeliberationBallot {
  return { proposalRef: 'prop-test', vote, confidence };
}

describe('deliberation tally (inside-TEE aggregate function)', () => {
  it('passes when net support ≥ margin', () => {
    const result = tallyBallots([ballot('support', 0.9), ballot('support', 0.8), ballot('oppose', 0.3)]);
    expect(result.verdict).toBe('pass');
    expect(result.participantCount).toBe(3);
  });

  it('fails when net support ≤ −margin', () => {
    const result = tallyBallots([ballot('oppose', 0.9), ballot('oppose', 0.8), ballot('support', 0.3)]);
    expect(result.verdict).toBe('fail');
  });

  it('is contested inside the margin', () => {
    const result = tallyBallots([ballot('support', 0.6), ballot('oppose', 0.5), ballot('abstain', 0.4)]);
    // W_s=0.6, W_o=0.5, W_a=0.4 → net = 0.1/1.5 ≈ 0.067 → contested
    expect(result.verdict).toBe('contested');
  });

  it('abstention shrinks the net ratio', () => {
    const withAbstain = tallyBallots([ballot('support', 0.6), ballot('oppose', 0.5), ballot('abstain', 0.9)]);
    expect(withAbstain.verdict).toBe('contested');
  });

  it('suppresses the tally below N=5 (small-N privacy rule)', () => {
    const small = tallyBallots([ballot('support', 1), ballot('support', 1), ballot('support', 1)]);
    expect(small.tally).toBeUndefined();
    const large = tallyBallots([
      ballot('support', 1), ballot('support', 1), ballot('support', 1),
      ballot('oppose', 0.5), ballot('abstain', 0.5),
    ]);
    expect(large.tally).toBeDefined();
  });

  it('rejects mixed-proposalRef batches (coherence guard — blind coordinator cannot)', () => {
    expect(() =>
      tallyBallots([
        { proposalRef: 'prop-a', vote: 'support', confidence: 1 },
        { proposalRef: 'prop-b', vote: 'support', confidence: 1 },
      ])
    ).toThrow(/proposalRefs/);
  });
});

describe('processBatch (TEE handler body, local)', () => {
  it('decrypts, validates, tallies, and signs — output verifiable with the TEE public key', async () => {
    const material = await generateKeyMaterial(['agent-1', 'agent-2', 'agent-3']);
    const roundId = 'round-test-1';

    const envelopes = [];
    for (let i = 0; i < 3; i++) {
      const agent = material.agents[i];
      const plaintext = JSON.stringify(ballot(i === 2 ? 'oppose' : 'support', i === 2 ? 0.3 : 0.5 + i * 0.1));
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
      envelopes.push({ ...base, signature: await signEnvelope(agent.sign.privateKey, base) });
    }

    const result: TeeSignedResult = await processBatch(
      { roundId, useCase: USE_CASES.deliberation, keyId: material.keyId, envelopes },
      {
        teeEncPub: material.teeEnc.publicKey,
        teeEncPriv: material.teeEnc.privateKey,
        teeSignPriv: material.teeSign.privateKey,
      }
    );

    expect(result.participantCount).toBe(3);
    expect((result.payload as { verdict: string }).verdict).toBe('pass');
    expect((result.payload as { tally?: unknown }).tally).toBeUndefined();

    const valid = await verifyTeeSignature(material.teeSign.publicKey, {
      useCase: result.useCase,
      roundId: result.roundId,
      participantCount: result.participantCount,
      timestamp: result.timestamp,
      payload: result.payload,
    }, result.teeSignature);
    expect(valid).toBe(true);

    // tampered payload must fail verification
    const tamperedValid = await verifyTeeSignature(material.teeSign.publicKey, {
      useCase: result.useCase,
      roundId: result.roundId,
      participantCount: result.participantCount,
      timestamp: result.timestamp,
      payload: { ...(result.payload as object), verdict: 'fail' },
    }, result.teeSignature);
    expect(tamperedValid).toBe(false);
  });

  it('rejects unknown use cases', async () => {
    const material = await generateKeyMaterial(['agent-1']);
    const ciphertext = await sealToEnclave(JSON.stringify(ballot('support', 1)), material.teeEnc.publicKey);
    const base = {
      version: ENVELOPE_VERSION,
      useCase: 'not-a-use-case',
      keyId: material.keyId,
      agentId: 'agent-1',
      roundId: 'r',
      nonce: randomUUID(),
      ciphertext,
      timestamp: Date.now(),
    };
    const envelope = { ...base, signature: await signEnvelope(material.agents[0].sign.privateKey, base) };

    await expect(
      processBatch(
        { roundId: 'r', useCase: 'not-a-use-case', keyId: material.keyId, envelopes: [envelope] },
        {
          teeEncPub: material.teeEnc.publicKey,
          teeEncPriv: material.teeEnc.privateKey,
          teeSignPriv: material.teeSign.privateKey,
        }
      )
    ).rejects.toThrow('Unknown use case');
  });

  it('rejects duplicate agents within a batch', async () => {
    const material = await generateKeyMaterial(['agent-1']);
    const ciphertext = await sealToEnclave(JSON.stringify(ballot('support', 1)), material.teeEnc.publicKey);
    const base = {
      version: ENVELOPE_VERSION,
      useCase: USE_CASES.deliberation,
      keyId: material.keyId,
      agentId: 'agent-1',
      roundId: 'r',
      nonce: randomUUID(),
      ciphertext,
      timestamp: Date.now(),
    };
    const envelope = { ...base, signature: await signEnvelope(material.agents[0].sign.privateKey, base) };

    await expect(
      processBatch(
        { roundId: 'r', useCase: USE_CASES.deliberation, keyId: material.keyId, envelopes: [envelope, envelope] },
        {
          teeEncPub: material.teeEnc.publicKey,
          teeEncPriv: material.teeEnc.privateKey,
          teeSignPriv: material.teeSign.privateKey,
        }
      )
    ).rejects.toThrow('Duplicate');
  });
});
