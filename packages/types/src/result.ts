import type { UseCaseId } from './envelope.js';

export interface TeeSignedResult {
  version: number;
  useCase: UseCaseId;
  roundId: string;
  participantCount: number;
  timestamp: number;
  payload: unknown;
  teeSignature: string;
}

export const TEE_RESULT_VERSION = 1;

export interface SignedResultStatus {
  useCase: UseCaseId;
  roundId: string;
  timestamp: number;
  participantCount: number;
}
