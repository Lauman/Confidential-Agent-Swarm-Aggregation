import { ready, toB64, fromB64 } from './bytes.js';
export async function generateEncKeyPair() {
    const s = await ready();
    const kp = s.crypto_box_keypair();
    return { publicKey: toB64(kp.publicKey), privateKey: toB64(kp.privateKey) };
}
export async function sealToEnclave(plaintext, encPubB64) {
    const s = await ready();
    const sealed = s.crypto_box_seal(s.from_string(plaintext), fromB64(encPubB64));
    return toB64(sealed);
}
export async function openSealed(ciphertextB64, encPubB64, encPrivB64) {
    const s = await ready();
    const opened = s.crypto_box_seal_open(fromB64(ciphertextB64), fromB64(encPubB64), fromB64(encPrivB64));
    return s.to_string(opened);
}
//# sourceMappingURL=sealed-box.js.map