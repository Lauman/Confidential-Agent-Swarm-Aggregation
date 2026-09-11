import * as path from 'node:path';
import * as url from 'node:url';
import * as os from 'node:os';
import { SUPPORTED_USE_CASES } from '@private-signal-swarm/confidential-core';

const WORKSPACE_ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..', '..', '..');

function resolveFromRoot(p: string | undefined, fallback: string): string {
  if (!p) {
    return path.join(WORKSPACE_ROOT, fallback);
  }
  return path.isAbsolute(p) ? p : path.resolve(WORKSPACE_ROOT, p);
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
    ? path.isAbsolute(process.env.STATE_DIR) ? process.env.STATE_DIR : path.resolve(WORKSPACE_ROOT, process.env.STATE_DIR)
    : path.join(os.tmpdir(), 'private-signal-swarm-coordinator'),
  resultIngestUrl: process.env.RESULT_INGEST_URL || undefined,
  creGatewayUrl: process.env.CRE_GATEWAY_URL || undefined,
  creWorkflowId: process.env.CRE_WORKFLOW_ID || undefined,
  coordinatorSigningKey:
    process.env.COORDINATOR_SIGNING_KEY ||
    process.env.TRIGGER_PRIVATE_KEY ||
    process.env.HEDERA_PRIVATE_KEY ||
    undefined,
  donTeeEncPub: process.env.DON_TEE_ENC_PUB || process.env.CRE_TEE_ENC_PUB || undefined,
};
