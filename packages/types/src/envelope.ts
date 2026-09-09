export const ENVELOPE_VERSION = 1;

export type UseCaseId = string;

export interface EncryptedEnvelope {
  version: number;
  useCase: UseCaseId;
  keyId: string;
  agentId: string;
  roundId: string;
  nonce: string;
  ciphertext: string;
  signature: string;
  timestamp: number;
}

export interface BatchRequest {
  roundId: string;
  useCase: UseCaseId;
  keyId: string;
  envelopes: EncryptedEnvelope[];
}

export const ENVELOPE_ERRORS = [
  'invalid-envelope',
  'unknown-usecase',
  'unknown-key',
  'invalid-signature',
  'duplicate-nonce',
  'already-submitted',
  'round-closed',
] as const;

export type EnvelopeErrorCode = (typeof ENVELOPE_ERRORS)[number];

export interface EnvelopeErrorBody {
  error: EnvelopeErrorCode;
  message: string;
}
