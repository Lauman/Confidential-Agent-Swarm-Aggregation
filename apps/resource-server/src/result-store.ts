import {
  TEE_RESULT_VERSION,
  type SignedResultStatus,
  type TeeSignedResult,
} from '@private-signal-swarm/types';
import {
  verifyTeeSignature,
  type KeymapFile,
} from '@private-signal-swarm/confidential-core';
import { z } from 'zod';

const resultSchema = z.object({
  version: z.literal(TEE_RESULT_VERSION),
  useCase: z.string().min(1),
  roundId: z.string().min(1),
  participantCount: z.number().int().positive(),
  timestamp: z.number().int().positive(),
  payload: z.unknown(),
  teeSignature: z.string().min(1),
});

export class ResultVerificationError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'ResultVerificationError';
    this.code = code;
  }
}

export class VerifiedResultStore {
  private readonly teeSignPub: string;
  private readonly keyId: string;
  private readonly latest = new Map<string, TeeSignedResult>();

  constructor(keymap: KeymapFile) {
    this.teeSignPub = keymap.tee.signPub;
    this.keyId = keymap.keyId;
  }

  get teePub(): string {
    return this.teeSignPub;
  }

  get currentKeyId(): string {
    return this.keyId;
  }

  async ingest(input: unknown): Promise<TeeSignedResult> {
    const parsed = resultSchema.safeParse(input);
    if (!parsed.success) {
      throw new ResultVerificationError('malformed', parsed.error.message);
    }
    const result = parsed.data as TeeSignedResult;

    const valid = await verifyTeeSignature(
      this.teeSignPub,
      {
        useCase: result.useCase,
        roundId: result.roundId,
        participantCount: result.participantCount,
        timestamp: result.timestamp,
        payload: result.payload,
      },
      result.teeSignature
    );
    if (!valid) {
      throw new ResultVerificationError('unverified', 'TEE signature verification failed — refusing to serve');
    }

    const current = this.latest.get(result.useCase);
    if (!current || result.timestamp >= current.timestamp) {
      this.latest.set(result.useCase, result);
    }
    return result;
  }

  getLatest(useCase: string): TeeSignedResult | undefined {
    return this.latest.get(useCase);
  }

  status(): SignedResultStatus[] {
    return Array.from(this.latest.values()).map((r) => ({
      useCase: r.useCase,
      roundId: r.roundId,
      timestamp: r.timestamp,
      participantCount: r.participantCount,
    }));
  }
}
