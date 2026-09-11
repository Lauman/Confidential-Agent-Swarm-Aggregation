import type { EncryptedEnvelope } from './envelope.js';
import type { TeeSignedResult } from './result.js';

export type RoundStatus = 'collecting' | 'closed' | 'aggregated' | 'failed';

/**
 * Submission metadata ONLY — agent identity, a hash of the ciphertext, and
 * timing. No ciphertext, no plaintext, nothing decryptable. Safe to serve
 * openly; participation metadata is public-by-design (threat model §8/L1).
 */
export interface SubmittedAgent {
  agentId: string;
  envelopeHash: string;
  submittedAt: number;
}

export interface RoundRecord {
  roundId: string;
  useCase: string;
  quorum: number;
  status: RoundStatus;
  submissionCount: number;
  submittedAgents: SubmittedAgent[];
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
