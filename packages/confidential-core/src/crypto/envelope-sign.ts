import { ready, toB64, fromB64 } from './bytes.js';

export interface SignKeyPair {
  publicKey: string;
  privateKey: string;
}

export async function generateSignKeyPair(): Promise<SignKeyPair> {
  const s = await ready();
  const kp = s.crypto_sign_keypair();
  return { publicKey: toB64(kp.publicKey), privateKey: toB64(kp.privateKey) };
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

export async function signEnvelope(privB64: string, env: Parameters<typeof envelopeCanonical>[0]): Promise<string> {
  const s = await ready();
  const sig = s.crypto_sign_detached(envelopeCanonical(env), fromB64(privB64));
  return toB64(sig);
}

export async function verifyEnvelope(pubB64: string, env: Parameters<typeof envelopeCanonical>[0], signatureB64: string): Promise<boolean> {
  const s = await ready();
  try {
    return s.crypto_sign_verify_detached(fromB64(signatureB64), envelopeCanonical(env), fromB64(pubB64));
  } catch {
    return false;
  }
}
