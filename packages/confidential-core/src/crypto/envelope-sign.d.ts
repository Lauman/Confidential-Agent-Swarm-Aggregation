export interface SignKeyPair {
    publicKey: string;
    privateKey: string;
}
export declare function generateSignKeyPair(): Promise<SignKeyPair>;
export declare function envelopeCanonical(env: {
    useCase: string;
    keyId: string;
    agentId: string;
    roundId: string;
    nonce: string;
    ciphertext: string;
    timestamp: number;
}): Uint8Array;
export declare function signEnvelope(privB64: string, env: Parameters<typeof envelopeCanonical>[0]): Promise<string>;
export declare function verifyEnvelope(pubB64: string, env: Parameters<typeof envelopeCanonical>[0], signatureB64: string): Promise<boolean>;
//# sourceMappingURL=envelope-sign.d.ts.map