import { randomBytes as nobleRandomBytes } from '@noble/ciphers/utils.js';

export type Bytes = Uint8Array;

export function toB64(bytes: Bytes): string {
  return Buffer.from(bytes).toString('base64');
}

export function fromB64(value: string): Bytes {
  return new Uint8Array(Buffer.from(value, 'base64'));
}

export function randomBytes(n: number): Bytes {
  return nobleRandomBytes(n);
}
