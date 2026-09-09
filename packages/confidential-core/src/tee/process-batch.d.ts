import { type BatchRequest, type TeeSignedResult } from '@private-signal-swarm/types';
export interface ProcessBatchSecrets {
    teeEncPub: string;
    teeEncPriv: string;
    teeSignPriv: string;
}
export interface ProcessedBallot {
    agentId: string;
    nonce: string;
    payload: unknown;
}
export declare class BatchProcessingError extends Error {
    constructor(message: string);
}
export declare function processBatch(batch: BatchRequest, secrets: ProcessBatchSecrets): Promise<TeeSignedResult>;
//# sourceMappingURL=process-batch.d.ts.map