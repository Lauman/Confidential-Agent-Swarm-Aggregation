import {
  ENVELOPE_VERSION,
  type EncryptedEnvelope,
  type EnvelopeErrorCode,
} from '@private-signal-swarm/types';
import { verifyEnvelope } from '@private-signal-swarm/confidential-core';
import { z } from 'zod';
import type { KeymapFile } from '@private-signal-swarm/confidential-core';
import { resolveAgentSignPub } from './keymap.js';

const envelopeSchema = z.object({
  version: z.literal(ENVELOPE_VERSION),
  useCase: z.string().min(1),
  keyId: z.string().min(1),
  agentId: z.string().min(1),
  roundId: z.string().min(1),
  nonce: z.string().min(1),
  ciphertext: z.string().min(1),
  signature: z.string().min(1),
  timestamp: z.number().int().positive(),
});

export class EnvelopeValidationError extends Error {
  readonly code: EnvelopeErrorCode;

  constructor(code: EnvelopeErrorCode, message: string) {
    super(message);
    this.name = 'EnvelopeValidationError';
    this.code = code;
  }
}

export interface EnvelopeValidatorOptions {
  keymap: KeymapFile;
  allowedUseCases: readonly string[];
}

export class EnvelopeValidator {
  private readonly keymap: KeymapFile;
  private readonly allowedUseCases: readonly string[];

  constructor(options: EnvelopeValidatorOptions) {
    this.keymap = options.keymap;
    this.allowedUseCases = options.allowedUseCases;
  }

  async validate(input: unknown): Promise<EncryptedEnvelope> {
    const parsed = envelopeSchema.safeParse(input);
    if (!parsed.success) {
      throw new EnvelopeValidationError('invalid-envelope', parsed.error.message);
    }
    const envelope = parsed.data;

    if (!this.allowedUseCases.includes(envelope.useCase)) {
      throw new EnvelopeValidationError('unknown-usecase', `Use case not allowed: ${envelope.useCase}`);
    }

    if (envelope.keyId !== this.keymap.keyId) {
      throw new EnvelopeValidationError(
        'unknown-key',
        `Unknown keyId ${envelope.keyId} (current: ${this.keymap.keyId}) — re-resolve keys`
      );
    }

    const signPub = resolveAgentSignPub(this.keymap, envelope.agentId);
    if (!signPub) {
      throw new EnvelopeValidationError('invalid-signature', `Unknown agent: ${envelope.agentId}`);
    }

    const valid = await verifyEnvelope(signPub, envelope, envelope.signature);
    if (!valid) {
      throw new EnvelopeValidationError('invalid-signature', `Signature verification failed for ${envelope.agentId}`);
    }

    return envelope;
  }
}
