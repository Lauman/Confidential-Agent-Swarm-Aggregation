export interface TeeResultSigningInput {
    useCase: string;
    roundId: string;
    participantCount: number;
    timestamp: number;
    payload: unknown;
}
export declare function teeResultCanonical(result: TeeResultSigningInput): Uint8Array;
export declare function teeSignResult(privB64: string, result: TeeResultSigningInput): Promise<string>;
export declare function verifyTeeSignature(pubB64: string, result: TeeResultSigningInput, signatureB64: string): Promise<boolean>;
//# sourceMappingURL=tee-sign.d.ts.map