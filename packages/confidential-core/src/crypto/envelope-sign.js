import { ready, toB64, fromB64 } from './bytes.js';
export async function generateSignKeyPair() {
    const s = await ready();
    const kp = s.crypto_sign_keypair();
    return { publicKey: toB64(kp.publicKey), privateKey: toB64(kp.privateKey) };
}
export function envelopeCanonical(env) {
    const canonical = ['v1', env.useCase, env.keyId, env.agentId, env.roundId, env.nonce, env.ciphertext, String(env.timestamp)].join('|');
    return new TextEncoder().encode(canonical);
}
export async function signEnvelope(privB64, env) {
    const s = await ready();
    const sig = s.crypto_sign_detached(envelopeCanonical(env), fromB64(privB64));
    return toB64(sig);
}
export async function verifyEnvelope(pubB64, env, signatureB64) {
    const s = await ready();
    try {
        return s.crypto_sign_verify_detached(fromB64(signatureB64), envelopeCanonical(env), fromB64(pubB64));
    }
    catch {
        return false;
    }
}
//# sourceMappingURL=envelope-sign.js.map