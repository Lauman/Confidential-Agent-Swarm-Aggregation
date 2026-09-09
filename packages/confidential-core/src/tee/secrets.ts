/**
 * Unwrap an SDK Secret (protobuf message) to its string value.
 * Defensive across shapes: plain string, { value }, or raw bytes.
 */
export function secretToString(secret: unknown): string {
  if (typeof secret === 'string') {
    return secret;
  }
  if (secret instanceof Uint8Array) {
    return new TextDecoder().decode(secret);
  }
  if (secret && typeof secret === 'object') {
    const record = secret as Record<string, unknown>;
    if (typeof record.value === 'string') {
      return record.value;
    }
    if (record.value instanceof Uint8Array) {
      return new TextDecoder().decode(record.value);
    }
  }
  throw new Error(`Unexpected secret shape: ${typeof secret}`);
}
