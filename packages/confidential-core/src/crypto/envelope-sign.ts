import { ed25519 } from '@noble/curves/ed25519.js';
import { randomBytes, toB64, fromB64 } from './bytes.js';

export interface SignKeyPair {
  publicKey: string;
  /** 64-byte libsodium-style secret (32-byte seed + 32-byte pubkey) */
  privateKey: string;
}

export async function generateSignKeyPair(): Promise<SignKeyPair> {
  const seed = randomBytes(32);
  const publicKey = ed25519.getPublicKey(seed);
  const full = new Uint8Array(64);
  full.set(seed, 0);
  full.set(publicKey, 32);
  return { publicKey: toB64(publicKey), privateKey: toB64(full) };
}

export function envelopeCanonical(env: {
  useCase: string;
  keyId: string;
  agentId: string;
  roundId: string;
  nonce: string;
  ciphertext: string;
  timestamp: number;
}): Uint8Array {
  const canonical = ['v1', env.useCase, env.keyId, env.agentId, env.roundId, env.nonce, env.ciphertext, String(env.timestamp)].join('|');
  return new TextEncoder().encode(canonical);
}

function seedOf(privB64: string): Uint8Array {
  const full = fromB64(privB64);
  return full.length === 64 ? full.slice(0, 32) : full;
}

export async function signEnvelope(privB64: string, env: Parameters<typeof envelopeCanonical>[0]): Promise<string> {
  const sig = ed25519.sign(envelopeCanonical(env), seedOf(privB64));
  return toB64(sig);
}

export async function verifyEnvelope(pubB64: string, env: Parameters<typeof envelopeCanonical>[0], signatureB64: string): Promise<boolean> {
  try {
    return ed25519.verify(fromB64(signatureB64), envelopeCanonical(env), fromB64(pubB64));
  } catch {
    return false;
  }
}
