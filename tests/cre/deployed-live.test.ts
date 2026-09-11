import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ENVELOPE_VERSION, USE_CASES, type EncryptedEnvelope } from '@private-signal-swarm/types';
import {
  sealToEnclave,
  signEnvelope,
  tallyBallots,
} from '@private-signal-swarm/confidential-core';
import { deliberateMock } from '../../apps/agent/dist/payload/deliberation.js';
import { DeployedWorkflowTrigger } from '../../apps/coordinator/src/trigger-client.js';

/**
 * LIVE DON test — skipped unless LIVE_DON_TEST=1.
 *
 * Triggers the DEPLOYED plain aggregation workflow with a fresh 3-envelope
 * batch (ballots sealed to the DON vault key, signed with dev agent keys),
 * polls the execution to a terminal state, and asserts the DON really ran
 * this round: status SUCCESS + roundId/participants attested in DON logs.
 *
 * Needs: built workspace (`pnpm build`), CRE CLI, root .env with
 * TRIGGER_PRIVATE_KEY (authorized signer) + CRE_TEE_ENC_PUB (vault key),
 * and dev keys under packages/confidential-core/.dev-keys.
 * Run: LIVE_DON_TEST=1 pnpm --filter @private-signal-swarm/cre-workflow test
 *
 * Never prints secret values.
 */
const LIVE = process.env.LIVE_DON_TEST === '1';

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(THIS_DIR, '..', '..');
const CRE_DIR = path.join(ROOT, 'cre');
const PLAIN_WORKFLOW_ID = '0066a0bde3480237aae16e638a6a15dfae737fc2ea85418116287587079c3aed';
const GATEWAY = 'https://01.gateway.zone-a.cre.chain.link/';

function loadDotEnvFile(filePath: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!fs.existsSync(filePath)) {
    return out;
  }
  for (const line of fs.readFileSync(filePath, 'utf-8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) {
      continue;
    }
    const idx = trimmed.indexOf('=');
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key && out[key] === undefined) {
      out[key] = value;
    }
  }
  return out;
}

function resolveRoot(p: string): string {
  return path.isAbsolute(p) ? p : path.join(ROOT, p);
}

function cre(args: string[]): string {
  const bin = process.env.CRE_BIN || path.join(os.homedir(), '.cre', 'bin', 'cre');
  return execFileSync(bin, [...args, '--non-interactive'], {
    cwd: CRE_DIR,
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

describe.skipIf(!LIVE)('deployed DON workflow (live)', () => {
  it(
    'aggregates a fresh envelope batch on the DON (SUCCESS + log attestation)',
    async () => {
      for (const file of [path.join(ROOT, '.env'), path.join(CRE_DIR, '.env')]) {
        Object.assign(process.env, loadDotEnvFile(file));
      }

      const signingKey =
        process.env.COORDINATOR_SIGNING_KEY ||
        process.env.TRIGGER_PRIVATE_KEY ||
        process.env.HEDERA_PRIVATE_KEY;
      expect(
        signingKey,
        'authorized trigger key (COORDINATOR_SIGNING_KEY/TRIGGER_PRIVATE_KEY/HEDERA_PRIVATE_KEY)'
      ).toBeTruthy();
      const donEncPub = process.env.DON_TEE_ENC_PUB || process.env.CRE_TEE_ENC_PUB;
      expect(donEncPub, 'DON vault TEE pubkey (DON_TEE_ENC_PUB/CRE_TEE_ENC_PUB)').toBeTruthy();

      const secretsPath = resolveRoot(
        process.env.DEV_SECRETS_PATH ||
          'packages/confidential-core/.dev-keys/dev-secrets.json'
      );
      expect(fs.existsSync(secretsPath), `dev secrets at ${secretsPath}`).toBe(true);
      const secrets = JSON.parse(fs.readFileSync(secretsPath, 'utf-8')) as {
        agents: Record<string, { signPriv: string }>;
      };

      const workflowId = process.env.CRE_WORKFLOW_ID || PLAIN_WORKFLOW_ID;
      const gateway = process.env.CRE_GATEWAY_URL || GATEWAY;
      const roundId = `don-test-${Date.now().toString(36)}`;
      const agentIds = ['agent-1', 'agent-2', 'agent-3'];
      const proposalRef = 'proposal-don-test';

      const ballots = agentIds.map((agentId) => deliberateMock(agentId, proposalRef));
      const expected = tallyBallots(ballots);

      const envelopes: EncryptedEnvelope[] = [];
      for (let i = 0; i < agentIds.length; i++) {
        const agentId = agentIds[i];
        const signPriv = secrets.agents[agentId]?.signPriv;
        expect(signPriv, `dev sign key for ${agentId}`).toBeTruthy();
        const ciphertext = await sealToEnclave(JSON.stringify(ballots[i]), donEncPub as string);
        const base = {
          version: ENVELOPE_VERSION,
          useCase: USE_CASES.deliberation,
          keyId: 'enclave-1',
          agentId,
          roundId,
          nonce: randomUUID(),
          ciphertext,
          timestamp: Date.now(),
        };
        envelopes.push({ ...base, signature: await signEnvelope(signPriv as string, base) });
      }

      const trigger = new DeployedWorkflowTrigger({
        gatewayUrl: gateway,
        workflowId,
        signingKey: signingKey as string,
      });
      const t0 = Date.now();
      const submit = await trigger.execute({
        roundId,
        useCase: USE_CASES.deliberation,
        keyId: 'enclave-1',
        envelopes,
      });
      expect(submit.accepted, `gateway response: ${JSON.stringify(submit.body).slice(0, 300)}`).toBe(
        true
      );

      const timeoutMs = parseInt(process.env.POLL_TIMEOUT_MS || '300000', 10);
      const intervalMs = parseInt(process.env.POLL_INTERVAL_MS || '15000', 10);
      const deadline = Date.now() + timeoutMs;
      let record: { uuid: string; status: string; startedAt: string } | undefined;
      for (;;) {
        const raw = cre(['execution', 'list', workflowId, '--limit', '20', '--json']);
        const executions = (
          JSON.parse(raw.slice(raw.indexOf('['))) as Array<{
            uuid: string;
            status: string;
            startedAt: string;
          }>
        )
          .filter((e) => Date.parse(e.startedAt) >= t0 - 60_000)
          .sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt));
        const latest = executions[0];
        if (latest && (latest.status === 'SUCCESS' || latest.status === 'FAILURE')) {
          record = latest;
          break;
        }
        if (Date.now() > deadline) {
          throw new Error(
            `timed out waiting for DON execution (latest: ${
              latest ? `${latest.uuid} ${latest.status}` : 'none yet'
            })`
          );
        }
        await new Promise((resolve) => setTimeout(resolve, intervalMs));
      }

      expect(record?.status).toBe('SUCCESS');
      const logs = cre(['execution', 'logs', record?.uuid as string]);
      expect(logs).toContain(`roundId=${roundId}`);
      expect(logs).toContain(`participants=${agentIds.length}`);
      expect(expected.verdict).toMatch(/^(pass|fail|contested)$/);
    },
    360000
  );
});
