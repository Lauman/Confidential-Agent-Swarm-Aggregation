import type { z } from 'zod';
import type { UseCaseId } from '@private-signal-swarm/types';
export interface UseCaseModule<P> {
    id: UseCaseId;
    payloadSchema: z.ZodType<P>;
    aggregate(roundId: string, payloads: P[]): unknown;
}
export interface DecryptedBallot<P> {
    agentId: string;
    nonce: string;
    payload: P;
}
//# sourceMappingURL=types.d.ts.map