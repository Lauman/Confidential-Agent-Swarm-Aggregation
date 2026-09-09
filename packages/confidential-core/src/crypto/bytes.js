import sodium from 'libsodium-wrappers';
export async function ready() {
    await sodium.ready;
    return sodium;
}
export function toB64(bytes) {
    return Buffer.from(bytes).toString('base64');
}
export function fromB64(value) {
    return new Uint8Array(Buffer.from(value, 'base64'));
}
//# sourceMappingURL=bytes.js.map