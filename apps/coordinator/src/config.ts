import * as path from 'node:path';
import * as os from 'node:os';
import { SUPPORTED_USE_CASES } from '@private-signal-swarm/confidential-core';

function resolveFromRoot(p: string | undefined, fallback: string): string {
  if (!p) {
    return path.resolve(process.cwd(), fallback);
  }
  return path.isAbsolute(p) ? p : path.resolve(process.cwd(), p);
}

export const config = {
  port: parseInt(process.env.COORDINATOR_PORT || process.env.PORT || '3001'),
  quorum: parseInt(process.env.QUORUM || '3'),
  allowedUseCases: process.env.ALLOWED_USE_CASES
    ? process.env.ALLOWED_USE_CASES.split(',').map((s) => s.trim())
    : SUPPORTED_USE_CASES,
  keymapPath: resolveFromRoot(
    process.env.KEYMAP_PATH,
    path.join('packages/confidential-core/.dev-keys/keymap.json')
  ),
  devSecretsPath: resolveFromRoot(
    process.env.DEV_SECRETS_PATH,
    path.join('packages/confidential-core/.dev-keys/dev-secrets.json')
  ),
  stateDir: process.env.STATE_DIR
    ? path.resolve(process.cwd(), process.env.STATE_DIR)
    : path.join(os.tmpdir(), 'private-signal-swarm-coordinator'),
  resultIngestUrl: process.env.RESULT_INGEST_URL || undefined,
};
