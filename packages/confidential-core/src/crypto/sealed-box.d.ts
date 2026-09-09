export interface SealedBoxKeyPair {
    publicKey: string;
    privateKey: string;
}
export declare function generateEncKeyPair(): Promise<SealedBoxKeyPair>;
export declare function sealToEnclave(plaintext: string, encPubB64: string): Promise<string>;
export declare function openSealed(ciphertextB64: string, encPubB64: string, encPrivB64: string): Promise<string>;
//# sourceMappingURL=sealed-box.d.ts.map