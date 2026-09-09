import * as fs from 'node:fs';
import { generateEncKeyPair } from '../crypto/sealed-box.js';
import { generateSignKeyPair } from '../crypto/envelope-sign.js';
export async function generateKeyMaterial(agentIds, keyId = 'enclave-1') {
    const [teeEnc, teeSign] = await Promise.all([generateEncKeyPair(), generateSignKeyPair()]);
    const agents = [];
    for (const agentId of agentIds) {
        agents.push({ agentId, sign: await generateSignKeyPair() });
    }
    return { keyId, teeEnc, teeSign, agents };
}
export function toKeymap(material) {
    return {
        keyId: material.keyId,
        tee: { encPub: material.teeEnc.publicKey, signPub: material.teeSign.publicKey },
        agents: Object.fromEntries(material.agents.map((a) => [a.agentId, { signPub: a.sign.publicKey }])),
    };
}
export function toDevSecrets(material) {
    return {
        keyId: material.keyId,
        tee: {
            publicKey: material.teeEnc.publicKey,
            privateKey: material.teeEnc.privateKey,
            encPriv: material.teeEnc.privateKey,
            signPriv: material.teeSign.privateKey,
        },
        agents: Object.fromEntries(material.agents.map((a) => [a.agentId, { signPriv: a.sign.privateKey }])),
    };
}
export function loadKeymap(path) {
    return JSON.parse(fs.readFileSync(path, 'utf-8'));
}
export function loadDevSecrets(path) {
    return JSON.parse(fs.readFileSync(path, 'utf-8'));
}
//# sourceMappingURL=keymap.js.map