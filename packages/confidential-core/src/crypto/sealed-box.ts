import { x25519 } from '@noble/curves/ed25519.js';
import { xchacha20poly1305 } from '@noble/ciphers/chacha.js';
import { randomBytes, toB64, fromB64 } from './bytes.js';

export interface SealedBoxKeyPair {
  publicKey: string;
  privateKey: string;
}

export function generateEncKeyPair(): SealedBoxKeyPair {
  const privateKey = randomBytes(32);
  const publicKey = x25519.getPublicKey(privateKey);
  return { publicKey: toB64(publicKey), privateKey: toB64(privateKey) };
}

export function sealToEnclave(plaintext: string, encPubB64: string): string {
  const recipientPub = fromB64(encPubB64);
  const ephemeralPrivateKey = randomBytes(32);
  const ephemeralPublicKey = x25519.getPublicKey(ephemeralPrivateKey);
  const sharedSecret = x25519.getSharedSecret(ephemeralPrivateKey, recipientPub);
  const nonce = randomBytes(24);
  const cipher = xchacha20poly1305(sharedSecret, nonce);
  const plaintextBytes = new TextEncoder().encode(plaintext);
  const ciphertext = cipher.encrypt(plaintextBytes);
  const sealed = new Uint8Array(32 + 24 + ciphertext.length);
  sealed.set(ephemeralPublicKey, 0);
  sealed.set(nonce, 32);
  sealed.set(ciphertext, 56);
  return toB64(sealed);
}

export function openSealed(ciphertextB64: string, encPubB64: string, encPrivB64: string): string {
  const sealed = fromB64(ciphertextB64);
  const ephemeralPublicKey = sealed.slice(0, 32);
  const nonce = sealed.slice(32, 56);
  const ciphertext = sealed.slice(56);
  const recipientPriv = fromB64(encPrivB64);
  const sharedSecret = x25519.getSharedSecret(recipientPriv, ephemeralPublicKey);
  const cipher = xchacha20poly1305(sharedSecret, nonce);
  const plaintext = cipher.decrypt(ciphertext);
  return new TextDecoder().decode(plaintext);
}
