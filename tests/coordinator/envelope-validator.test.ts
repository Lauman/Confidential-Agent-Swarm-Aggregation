import { describe, it, expect, beforeAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  ENVELOPE_VERSION,
  USE_CASES,
  type EncryptedEnvelope,
} from '@private-signal-swarm/types';
import {
  generateKeyMaterial,
  sealToEnclave,
  signEnvelope,
  toKeymap,
  type KeyMaterial,
} from '@private-signal-swarm/confidential-core';
import { EnvelopeValidator, EnvelopeValidationError } from '../../apps/coordinator/src/envelope-validator.js';

let material: KeyMaterial;
let validator: EnvelopeValidator;

beforeAll(async () => {
  material = await generateKeyMaterial(['agent-1', 'agent-2']);
  validator = new EnvelopeValidator({
    keymap: toKeymap(material),
    allowedUseCases: [USE_CASES.deliberation],
  });
});

async function validEnvelope(overrides: Partial<EncryptedEnvelope> = {}): Promise<EncryptedEnvelope> {
  const ballot = { proposalRef: 'prop-1', vote: 'support' as const, confidence: 0.9 };
  const ciphertext = await sealToEnclave(JSON.stringify(ballot), material.teeEnc.publicKey);
  const base = {
    version: ENVELOPE_VERSION,
    useCase: USE_CASES.deliberation,
    keyId: material.keyId,
    agentId: material.agents[0].agentId,
    roundId: 'round-x',
    nonce: randomUUID(),
    ciphertext,
    timestamp: Date.now(),
  };
  const signature = await signEnvelope(material.agents[0].sign.privateKey, base);
  return { ...base, signature, ...overrides };
}

describe('EnvelopeValidator', () => {
  it('accepts a valid envelope', async () => {
    const env = await validEnvelope();
    const result = await validator.validate(env);
    expect(result.agentId).toBe('agent-1');
    expect(result.ciphertext).toBe(env.ciphertext);
  });

  it('rejects malformed shapes with invalid-envelope', async () => {
    await expect(validator.validate({ nope: true })).rejects.toMatchObject({ code: 'invalid-envelope' });
  });

  it('rejects non-allowlisted use cases', async () => {
    const env = await validEnvelope();
    await expect(
      validator.validate({ ...env, useCase: 'signal-estimate.v1' })
    ).rejects.toMatchObject({ code: 'unknown-usecase' });
  });

  it('rejects stale keyIds with unknown-key', async () => {
    const env = await validEnvelope({ keyId: 'enclave-old' });
    try {
      await validator.validate(env);
      throw new Error('should have thrown');
    } catch (e) {
      expect((e as EnvelopeValidationError).code).toBe('unknown-key');
    }
  });

  it('rejects tampered signatures with invalid-signature', async () => {
    const env = await validEnvelope();
    const tampered: EncryptedEnvelope = { ...env, ciphertext: env.ciphertext.slice(0, -4) + 'AAAA' };
    try {
      await validator.validate(tampered);
      throw new Error('should have thrown');
    } catch (e) {
      expect((e as EnvelopeValidationError).code).toBe('invalid-signature');
    }
  });

  it('rejects unregistered agents', async () => {
    const env = await validEnvelope({ agentId: 'agent-ghost' });
    try {
      await validator.validate(env);
      throw new Error('should have thrown');
    } catch (e) {
      expect((e as EnvelopeValidationError).code).toBe('invalid-signature');
    }
  });
});
