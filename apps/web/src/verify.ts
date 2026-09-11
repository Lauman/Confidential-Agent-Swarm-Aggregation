import { ed25519 } from '@noble/curves/ed25519.js';
import type { VerdictView } from './types.js';

function b64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

/**
 * Rebuilds the exact canonical byte string the TEE signed
 * (teeResultCanonical: v1|useCase|roundId|participantCount|timestamp|payload)
 * and verifies the ed25519 signature against the ENS-published TEE key.
 */
export function verifyVerdictSignature(verdict: VerdictView, teeSignPubB64: string): boolean {
  try {
    const canonical = [
      'v1',
      verdict.useCase,
      verdict.roundId,
      String(verdict.participantCount),
      String(verdict.timestamp),
      JSON.stringify(verdict.payload),
    ].join('|');
    return ed25519.verify(
      b64ToBytes(verdict.teeSignature),
      new TextEncoder().encode(canonical),
      b64ToBytes(teeSignPubB64)
    );
  } catch {
    return false;
  }
}
