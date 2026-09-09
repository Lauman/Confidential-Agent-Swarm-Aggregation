import sodium from 'libsodium-wrappers';
export declare function ready(): Promise<typeof sodium>;
export type Bytes = Uint8Array;
export declare function toB64(bytes: Bytes): string;
export declare function fromB64(value: string): Bytes;
//# sourceMappingURL=bytes.d.ts.map