import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { generateSimulatePayload } from './generate-simulate-payload.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const KEYS_DIR = path.join(ROOT, 'packages/confidential-core/.dev-keys');
const CRE_DIR = path.join(ROOT, 'cre');
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

  // Replay mode: SIMULATE_PAYLOAD_PATH points at a pre-built batch file
  // (e.g. a live round dumped by the coordinator). Otherwise a fresh
  // synthetic batch is generated into aggregate/test-payload.json.
  const replayPath = process.env.SIMULATE_PAYLOAD_PATH;
  const payloadArg = replayPath
    ? path.isAbsolute(replayPath)
      ? replayPath
      : path.join(ROOT, replayPath)
    : 'aggregate/test-payload.json';
  if (replayPath) {
    if (!fs.existsSync(payloadArg)) {
      throw new Error(`SIMULATE_PAYLOAD_PATH not found: ${payloadArg}`);
    }
    console.log(`Simulate replay payload: ${payloadArg}`);
  } else {
    await generateSimulatePayload();
  }

  const secrets = JSON.parse(
    fs.readFileSync(path.join(KEYS_DIR, 'dev-secrets.json'), 'utf-8')
  ) as { tee: { publicKey: string; encPriv: string; signPriv: string } };

  // Simulate targets (see workflow.yaml):
  //   - 'staging-settings': confidential workflow (handlerInTee, needs beta access)
  //   - 'plain-settings':   non-confidential twin of the same handler (no TEE)
  //   - 'simple-settings':   hello-world cron workflow (connectivity check only)
  const target = process.env.SIMULATE_TARGET || 'staging-settings';

  // Random ETH key for simulation when the workflow needs one and none is set.
  const ethPrivateKey = process.env.CRE_ETH_PRIVATE_KEY || generateEthPrivateKey();

  // The CLI resolves workflow secrets (cre/secrets.yaml) from an env file,
  // and a stale env file silently overrides process env — so always write a
  // fresh env file from the current dev keys and pass it explicitly with -e.
  // This keeps simulate hermetic across key rotations.
  const envFile = path.join(CRE_DIR, '.env.simulate');
  fs.writeFileSync(
    envFile,
    [
      `CRE_ETH_PRIVATE_KEY=${ethPrivateKey}`,
      `CRE_TEE_ENC_PUB=${secrets.tee.publicKey}`,
      `CRE_TEE_ENC_PRIV=${secrets.tee.encPriv}`,
      `CRE_TEE_SIGN_PRIV=${secrets.tee.signPriv}`,
    ].join('\n') + '\n'
  );

  const result = spawnSync(
    CRE_BIN,
    [
      'workflow', 'simulate', 'aggregate',
      '--target', target,
      '--non-interactive',
      '--trigger-index', '0',
      '--http-payload', payloadArg,
      '-e', envFile,
    ],
    {
      cwd: CRE_DIR,
      stdio: 'inherit',
      env: {
        ...process.env,
        CRE_ETH_PRIVATE_KEY: ethPrivateKey,
        // staging (confidential): consumed via runtime.getSecret in simulate
        TEE_ENC_PUB: secrets.tee.publicKey,
        TEE_ENC_PRIV: secrets.tee.encPriv,
        TEE_SIGN_PRIV: secrets.tee.signPriv,
        // plain (non-confidential twin): read from process.env directly
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
