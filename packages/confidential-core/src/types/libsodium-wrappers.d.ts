declare module 'libsodium-wrappers' {
  export interface KeyPair {
    publicKey: Uint8Array;
    privateKey: Uint8Array;
    keyType: string;
  }

  const sodium: {
    ready: Promise<void>;
    crypto_box_keypair(): KeyPair;
    crypto_box_seal(message: Uint8Array, recipientPublicKey: Uint8Array): Uint8Array;
    crypto_box_seal_open(
      ciphertext: Uint8Array,
      recipientPublicKey: Uint8Array,
      recipientPrivateKey: Uint8Array
    ): Uint8Array;
    crypto_sign_keypair(): KeyPair;
    crypto_sign_detached(message: Uint8Array, privateKey: Uint8Array): Uint8Array;
    crypto_sign_verify_detached(
      signature: Uint8Array,
      message: Uint8Array,
      publicKey: Uint8Array
    ): boolean;
    from_string(input: string): Uint8Array;
    to_string(bytes: Uint8Array): string;
  };

  export default sodium;
}
