import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateSimulatePayload } from './generate-simulate-payload.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const KEYS_DIR = path.join(ROOT, 'packages/confidential-core/.dev-keys');
const CRE_BIN = path.join(process.env.HOME ?? '', '.cre', 'bin', 'cre');

async function main() {
  if (!fs.existsSync(CRE_BIN)) {
    throw new Error(
      `CRE CLI not found at ${CRE_BIN}. Install it: https://docs.chain.link/cre/getting-started/cli-installation`
    );
  }

  await generateSimulatePayload();

  const secrets = JSON.parse(
    fs.readFileSync(path.join(KEYS_DIR, 'dev-secrets.json'), 'utf-8')
  ) as { tee: { publicKey: string; encPriv: string; signPriv: string } };

  const result = spawnSync(
    CRE_BIN,
    [
      'workflow', 'simulate', 'workflows/aggregate',
      '--target', 'staging-settings',
      '--non-interactive',
      '--trigger-index', '0',
      '--http-payload', 'workflows/aggregate/test-payload.json',
    ],
    {
      cwd: path.join(ROOT, 'cre'),
      stdio: 'inherit',
      env: {
        ...process.env,
        TEE_ENC_PUB: secrets.tee.publicKey,
        TEE_ENC_PRIV: secrets.tee.encPriv,
        TEE_SIGN_PRIV: secrets.tee.signPriv,
      },
    }
  );

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
