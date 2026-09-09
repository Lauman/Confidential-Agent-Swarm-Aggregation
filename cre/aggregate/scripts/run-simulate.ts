import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { generateSimulatePayload } from './generate-simulate-payload.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const KEYS_DIR = path.join(ROOT, 'packages/confidential-core/.dev-keys');
const CRE_BIN = path.join(process.env.HOME ?? '', '.cre', 'bin', 'cre');

function generateEthPrivateKey(): string {
  const bytes = randomBytes(32);
  return '0x' + bytes.toString('hex');
}

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

  const workflowDir = path.join(ROOT, 'cre', 'aggregate');
  const nodeModulesBin = path.join(workflowDir, 'node_modules', '.bin');

  const localBin = path.join(process.env.HOME ?? '', '.local', 'bin');
  // Use simple-settings target for testing (no external dependencies)
  // Other targets:
  //   - 'staging-settings': Main workflow with confidential features (needs beta access)
  //   - 'plain-settings': Non-confidential version (HTTPCapability WASM issues)
  const target = 'simple-settings';

  // Generate a random ETH private key for simulation if not provided
  const ethPrivateKey = process.env.CRE_ETH_PRIVATE_KEY || generateEthPrivateKey();

  const result = spawnSync(
    CRE_BIN,
    [
      'workflow', 'simulate', 'aggregate',
      '--target', target,
      '--non-interactive',
      '--trigger-index', '0',
      '--http-payload', 'aggregate/test-payload.json',
      '--skip-type-checks',
    ],
    {
      cwd: path.join(ROOT, 'cre'),
      stdio: 'inherit',
      env: {
        ...process.env,
        PATH: `${localBin}:${nodeModulesBin}:${process.env.PATH}`,
        CRE_ETH_PRIVATE_KEY: ethPrivateKey,
        CRE_TEE_ENC_PUB: secrets.tee.publicKey,
        CRE_TEE_ENC_PRIV: secrets.tee.encPriv,
        CRE_TEE_SIGN_PRIV: secrets.tee.signPriv,
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
