import { TEE_RESULT_VERSION, } from '@private-signal-swarm/types';
import { openSealed } from '../crypto/sealed-box.js';
import { teeSignResult } from '../crypto/tee-sign.js';
import { getUseCase } from '../registry/registry.js';
export class BatchProcessingError extends Error {
    constructor(message) {
        super(message);
        this.name = 'BatchProcessingError';
    }
}
export async function processBatch(batch, secrets) {
    const useCase = getUseCase(batch.useCase);
    if (!useCase) {
        throw new BatchProcessingError(`Unknown use case: ${batch.useCase}`);
    }
    const ballots = [];
    const seenAgents = new Set();
    const seenNonces = new Set();
    for (const envelope of batch.envelopes) {
        if (envelope.useCase !== batch.useCase || envelope.roundId !== batch.roundId) {
            throw new BatchProcessingError(`Envelope does not match batch (roundId/useCase mismatch)`);
        }
        if (seenAgents.has(envelope.agentId) || seenNonces.has(envelope.nonce)) {
            throw new BatchProcessingError(`Duplicate agent or nonce in batch: ${envelope.agentId}`);
        }
        seenAgents.add(envelope.agentId);
        seenNonces.add(envelope.nonce);
        const plaintext = await openSealed(envelope.ciphertext, secrets.teeEncPub, secrets.teeEncPriv);
        let parsed;
        try {
            parsed = JSON.parse(plaintext);
        }
        catch {
            throw new BatchProcessingError(`Ballot from ${envelope.agentId} is not valid JSON`);
        }
        const payload = useCase.payloadSchema.parse(parsed);
        ballots.push({ agentId: envelope.agentId, nonce: envelope.nonce, payload });
    }
    if (ballots.length === 0) {
        throw new BatchProcessingError('No envelopes in batch');
    }
    const payload = useCase.aggregate(batch.roundId, ballots.map((b) => b.payload));
    const timestamp = Date.now();
    const participantCount = ballots.length;
    const teeSignature = await teeSignResult(secrets.teeSignPriv, {
        useCase: batch.useCase,
        roundId: batch.roundId,
        participantCount,
        timestamp,
        payload,
    });
    return {
        version: TEE_RESULT_VERSION,
        useCase: batch.useCase,
        roundId: batch.roundId,
        participantCount,
        timestamp,
        payload,
        teeSignature,
    };
}
//# sourceMappingURL=process-batch.js.map