import { randomBytes as nobleRandomBytes } from '@noble/ciphers/utils.js';
import sodium from 'libsodium-wrappers';

export type Bytes = Uint8Array;

export async function ready(): Promise<typeof sodium> {
  await sodium.ready;
  return sodium;
}

export function toB64(bytes: Bytes): string {
  return Buffer.from(bytes).toString('base64');
}

export function fromB64(value: string): Bytes {
  return new Uint8Array(Buffer.from(value, 'base64'));
}

export function randomBytes(n: number): Bytes {
  return nobleRandomBytes(n);
}
