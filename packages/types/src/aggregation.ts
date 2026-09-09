import type { EncryptedEnvelope } from './envelope.js';
import type { TeeSignedResult } from './result.js';

export type RoundStatus = 'collecting' | 'closed' | 'aggregated' | 'failed';

export interface RoundRecord {
  roundId: string;
  useCase: string;
  quorum: number;
  status: RoundStatus;
  submissionCount: number;
  batchHash?: string;
  result?: TeeSignedResult;
  closedAt?: number;
}

export interface BatchHandoff {
  roundId: string;
  useCase: string;
  batchHash: string;
  envelopes: EncryptedEnvelope[];
}
