import { ed25519 } from '@noble/curves/ed25519.js';
import { TEE_RESULT_VERSION } from '@private-signal-swarm/types';
import { toB64, fromB64 } from './bytes.js';

export interface TeeResultSigningInput {
  useCase: string;
  roundId: string;
  participantCount: number;
  timestamp: number;
  payload: unknown;
}

export function teeResultCanonical(result: TeeResultSigningInput): Uint8Array {
  const canonical = [
    `v${TEE_RESULT_VERSION}`,
    result.useCase,
    result.roundId,
    String(result.participantCount),
    String(result.timestamp),
    JSON.stringify(result.payload),
  ].join('|');
  return new TextEncoder().encode(canonical);
}

export function teeSignResult(privB64: string, result: TeeResultSigningInput): string {
  const fullPrivKey = fromB64(privB64);
  // libsodium returns 64-byte secret key (seed + public key), noble/curves expects 32-byte seed
  const privKey = fullPrivKey.length === 64 ? fullPrivKey.slice(0, 32) : fullPrivKey;
  const msg = teeResultCanonical(result);
  const sig = ed25519.sign(msg, privKey);
  return toB64(sig);
}

export function verifyTeeSignature(pubB64: string, result: TeeResultSigningInput, signatureB64: string): boolean {
  try {
    const pubKey = fromB64(pubB64);
    const sig = fromB64(signatureB64);
    const msg = teeResultCanonical(result);
    return ed25519.verify(sig, msg, pubKey);
  } catch {
    return false;
  }
}
