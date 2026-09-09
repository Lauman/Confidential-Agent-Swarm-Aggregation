import { TEE_RESULT_VERSION } from '@private-signal-swarm/types';
import { ready, toB64, fromB64 } from './bytes.js';
export function teeResultCanonical(result) {
    const canonical = [
        `v${TEE_RESULT_VERSION}`,
        result.useCase,
        result.roundId,
        String(result.participantCount),
        String(result.timestamp),
        JSON.stringify(result.payload),
    ].join('|');
    return new TextEncoder().encode(canonical);
}
export async function teeSignResult(privB64, result) {
    const s = await ready();
    const sig = s.crypto_sign_detached(teeResultCanonical(result), fromB64(privB64));
    return toB64(sig);
}
export async function verifyTeeSignature(pubB64, result, signatureB64) {
    const s = await ready();
    try {
        return s.crypto_sign_verify_detached(fromB64(signatureB64), teeResultCanonical(result), fromB64(pubB64));
    }
    catch {
        return false;
    }
}
//# sourceMappingURL=tee-sign.js.map