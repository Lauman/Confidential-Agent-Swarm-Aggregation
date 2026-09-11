/**
 * Deployed-workflow live-round probe (full-flow Step 5, CRE_PROBE_MODE=deployed).
 *
 * The coordinator's live batch is sealed to the LOCAL dev TEE key, which the
 * DON cannot decrypt. This probe rebuilds an equivalent batch for the same
 * round — identical deterministic mock ballots (deliberateMock), re-sealed to
 * the DON vault pubkey, re-signed with the dev agent keys — triggers the
 * DEPLOYED workflow via the gateway, polls the execution to a terminal state,
 * and attests the DON really aggregated this round (status + roundId in logs).
 *
 * If a future deployment logs the full signed result JSON, this probe upgrades
 * automatically: it extracts it from the logs and verifies the TEE signature
 * plus verdict agreement. Until then it reports attestation mode.
 *
 * Env:
 *   LIVE_BATCH_PATH   coordinator-dumped live batch JSON (required)
 *   PROPOSAL_REF      proposal ref the agents deliberated on (required)
 *   CRE_WORKFLOW_ID   default = deployed plain aggregation workflow
 *   CRE_GATEWAY_URL   default = zone-a gateway
 *   COORDINATOR_SIGNING_KEY | TRIGGER_PRIVATE_KEY | HEDERA_PRIVATE_KEY
 *   DON_TEE_ENC_PUB   DON vault TEE pubkey (default: CRE_TEE_ENC_PUB from cre/.env)
 *   DON_TEE_SIGN_PUB  DON vault TEE sign pubkey, for result verification when
 *                     deployments log the full result (default: derived constant)
 *   CRE_BIN           default $HOME/.cre/bin/cre
 *   POLL_TIMEOUT_MS   default 300000; POLL_INTERVAL_MS default 15000
 *   KEYMAP_PATH / DEV_SECRETS_PATH (dev key files, for agent sign keys)
 *
 * Never prints secret values. Exit 0 = PASS, 1 = FAIL.
 */
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  sealToEnclave,
  signEnvelope,
  verifyTeeSignature,
  tallyBallots,
} from '@private-signal-swarm/confidential-core';
import { deliberateMock } from '@private-signal-swarm/agent/dist/payload/deliberation.js';
import { ENVELOPE_VERSION, USE_CASES, type EncryptedEnvelope } from '@private-signal-swarm/types';
import { DeployedWorkflowTrigger } from '../src/trigger-client.js';

const PLAIN_WORKFLOW_ID = '0066a0bde3480237aae16e638a6a15dfae737fc2ea85418116287587079c3aed';
const GATEWAY = 'https://01.gateway.zone-a.cre.chain.link/';
// DON vault TEE sign pubkey (public — safe to embed; override via DON_TEE_SIGN_PUB).
const DON_SIGN_PUB_DEFAULT = 'pf0LFG/LXL57ojdMYameqYsH2mIZUs4REcC6F7GVxa4=';

const ROOT = findWorkspaceRoot(fileURLToPath(import.meta.url));

function findWorkspaceRoot(start: string): string {
  let dir = path.dirname(start);
  for (;;) {
    if (fs.existsSync(path.join(dir, 'pnpm-workspace.yaml'))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      throw new Error('workspace root (pnpm-workspace.yaml) not found');
    }
    dir = parent;
  }
}

function loadDotEnvFile(filePath: string): void {
  if (!fs.existsSync(filePath)) {
    return;
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
    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

loadDotEnvFile(path.join(ROOT, '.env'));
loadDotEnvFile(path.join(ROOT, 'cre', '.env'));

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Set ${name}`);
  }
  return value;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface ExecutionRecord {
  uuid: string;
  status: string;
  startedAt: string;
  finishedAt?: string;
}

function listExecutions(creBin: string, workflowId: string): ExecutionRecord[] {
  const out = execFileSync(
    creBin,
    ['execution', 'list', workflowId, '--limit', '20', '--json', '--non-interactive'],
    { cwd: path.join(ROOT, 'cre'), encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] }
  );
  const jsonStart = out.indexOf('[');
  if (jsonStart === -1) {
    throw new Error(`could not parse execution list output: ${out.slice(0, 200)}`);
  }
  return JSON.parse(out.slice(jsonStart)) as ExecutionRecord[];
}

function executionLogs(creBin: string, uuid: string): string {
  return execFileSync(creBin, ['execution', 'logs', uuid, '--non-interactive'], {
    cwd: path.join(ROOT, 'cre'),
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

async function main(): Promise<void> {
  const batchPath = required('LIVE_BATCH_PATH');
  const proposalRef = required('PROPOSAL_REF');
  const workflowId = process.env.CRE_WORKFLOW_ID || PLAIN_WORKFLOW_ID;
  const gateway = process.env.CRE_GATEWAY_URL || GATEWAY;
  const creBin = process.env.CRE_BIN || path.join(os.homedir(), '.cre', 'bin', 'cre');
  if (!fs.existsSync(creBin)) {
    throw new Error(`CRE CLI not found at ${creBin}`);
  }
  const signingKey =
    process.env.COORDINATOR_SIGNING_KEY ||
    process.env.TRIGGER_PRIVATE_KEY ||
    process.env.HEDERA_PRIVATE_KEY;
  if (!signingKey) {
    throw new Error('Set COORDINATOR_SIGNING_KEY, TRIGGER_PRIVATE_KEY, or HEDERA_PRIVATE_KEY');
  }
  const donEncPub = process.env.DON_TEE_ENC_PUB || process.env.CRE_TEE_ENC_PUB;
  if (!donEncPub) {
    throw new Error('Set DON_TEE_ENC_PUB (or CRE_TEE_ENC_PUB in cre/.env)');
  }

  const batch = JSON.parse(fs.readFileSync(batchPath, 'utf-8')) as {
    roundId: string;
    useCase: string;
    keyId: string;
    envelopes: Array<{ agentId: string }>;
  };
  const agentIds = batch.envelopes.map((e) => e.agentId);
  if (batch.useCase !== USE_CASES.deliberation) {
    throw new Error(`deployed probe supports deliberation rounds only (got ${batch.useCase})`);
  }

  const secretsPath =
    process.env.DEV_SECRETS_PATH ||
    path.join(ROOT, 'packages/confidential-core/.dev-keys/dev-secrets.json');
  const secrets = JSON.parse(fs.readFileSync(secretsPath, 'utf-8')) as {
    agents: Record<string, { signPriv: string }>;
  };

  // Rebuild the live round's ballots identically, sealed to the DON vault key.
  const ballots = agentIds.map((agentId) => deliberateMock(agentId, proposalRef));
  const expected = tallyBallots(ballots);
  console.log(
    `Live round ${batch.roundId}: ${agentIds.length} ballots, ` +
      `locally expected verdict=${expected.verdict}`
  );

  const envelopes: EncryptedEnvelope[] = [];
  for (let i = 0; i < agentIds.length; i++) {
    const agentId = agentIds[i];
    const signPriv = secrets.agents[agentId]?.signPriv;
    if (!signPriv) {
      throw new Error(`No dev sign key for ${agentId}`);
    }
    const ciphertext = await sealToEnclave(JSON.stringify(ballots[i]), donEncPub);
    const base = {
      version: ENVELOPE_VERSION,
      useCase: batch.useCase,
      keyId: batch.keyId,
      agentId,
      roundId: batch.roundId,
      nonce: randomUUID(),
      ciphertext,
      timestamp: Date.now(),
    };
    envelopes.push({ ...base, signature: await signEnvelope(signPriv, base) });
  }

  const trigger = new DeployedWorkflowTrigger({ gatewayUrl: gateway, workflowId, signingKey });
  console.log(`Trigger signer: ${trigger.address}`);
  console.log(`Workflow: ${workflowId}`);
  const t0 = Date.now();
  const submit = await trigger.execute({
    roundId: batch.roundId,
    useCase: batch.useCase,
    keyId: batch.keyId,
    envelopes,
  });
  if (!submit.accepted) {
    console.error(`gateway response: ${JSON.stringify(submit.body).slice(0, 500)}`);
    throw new Error('deployed workflow trigger not ACCEPTED');
  }
  console.log(`Trigger ACCEPTED, gateway execution id: ${submit.executionId}`);

  // Poll: match our execution by start time (gateway id is not directly queryable).
  const timeoutMs = parseInt(process.env.POLL_TIMEOUT_MS || '300000', 10);
  const intervalMs = parseInt(process.env.POLL_INTERVAL_MS || '15000', 10);
  const skewAllowance = 60_000;
  let record: ExecutionRecord | undefined;
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const executions = listExecutions(creBin, workflowId).filter(
      (e) => Date.parse(e.startedAt) >= t0 - skewAllowance
    );
    executions.sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt));
    const latest = executions[0];
    if (latest && (latest.status === 'SUCCESS' || latest.status === 'FAILURE')) {
      record = latest;
      break;
    }
    if (Date.now() > deadline) {
      throw new Error(
        `timed out waiting for DON execution ` +
          `(latest: ${latest ? `${latest.uuid} ${latest.status}` : 'none yet'})`
      );
    }
    const seen = latest ? `${latest.uuid} ${latest.status}` : 'none yet';
    console.log(`Waiting for DON execution... (${seen})`);
    await sleep(intervalMs);
  }
  console.log(`DON execution ${record.uuid}: ${record.status}`);

  if (record.status !== 'SUCCESS') {
    console.error(executionLogs(creBin, record.uuid).slice(0, 2000));
    throw new Error('deployed workflow execution FAILED on the DON');
  }

  const logs = executionLogs(creBin, record.uuid);
  const attestation = logs
    .split('\n')
    .find((line) => line.includes(`roundId=${batch.roundId}`));
  if (!attestation || !attestation.includes(`participants=${agentIds.length}`)) {
    console.error(logs.slice(0, 2000));
    throw new Error('DON logs do not attest our round (roundId/participants missing)');
  }
  console.log(`✓ DON attests round: ${attestation.trim().slice(-120)}`);

  // Upgrade path: if the deployment logs the full signed result, verify it.
  const donSignPub = process.env.DON_TEE_SIGN_PUB || DON_SIGN_PUB_DEFAULT;
  for (const line of logs.split('\n')) {
    const start = line.indexOf('{');
    if (start === -1 || !line.includes('teeSignature')) {
      continue;
    }
    try {
      const candidate = JSON.parse(line.slice(start)) as {
        roundId?: string;
        useCase?: string;
        participantCount?: number;
        timestamp?: number;
        payload?: unknown;
        teeSignature?: string;
      };
      if (
        candidate.roundId === batch.roundId &&
        typeof candidate.teeSignature === 'string' &&
        candidate.payload !== undefined &&
        typeof candidate.participantCount === 'number' &&
        typeof candidate.timestamp === 'number' &&
        typeof candidate.useCase === 'string'
      ) {
        const canonical = {
          useCase: candidate.useCase,
          roundId: candidate.roundId,
          participantCount: candidate.participantCount,
          timestamp: candidate.timestamp,
          payload: candidate.payload,
        };
        const ok = await verifyTeeSignature(donSignPub, canonical, candidate.teeSignature);
        if (!ok) {
          throw new Error('DON result signature INVALID against DON TEE key');
        }
        console.log('✓ DON result signature valid (DON TEE key)');
        const verdict = (candidate.payload as { verdict?: string }).verdict;
        if (verdict !== expected.verdict) {
          throw new Error(`verdict mismatch: DON=${verdict} local=${expected.verdict}`);
        }
        console.log(`✓ DON verdict agrees: ${verdict}`);
        console.log('PASS (full result verification)');
        return;
      }
    } catch (error) {
      if (error instanceof Error && /INVALID|mismatch/.test(error.message)) {
        throw error;
      }
      // Not a result line — keep scanning.
    }
  }

  console.log(
    'PASS (attestation mode: execution SUCCESS + round attested in DON logs; ' +
      'no full result in logs — pre-result-logging deployment)'
  );
}

main().catch((error) => {
  console.error(`FAIL: ${error instanceof Error ? error.message : error}`);
  process.exit(1);
});
